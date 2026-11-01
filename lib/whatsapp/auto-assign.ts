import { prisma } from "@/lib/prisma";
import { getEligibleAssignees } from "@/lib/chat-assignees";
import { assignableCandidateIds } from "@/lib/users/availability";

/**
 * Auto-asigna un chat sin asignar. Primero prueba las reglas de enrutamiento
 * de la cuenta (WAAccountRoutingRule, roadmap P3-d) en orden — la primera que
 * haga match manda directo al agente que define, sin importar su carga
 * actual, salvo que ya esté en su tope (`User.maxOpenChats`), en cuyo caso cae
 * al balanceo normal de abajo en vez de bloquear la asignación. Sin reglas
 * (o sin match), asigna al agente elegible con menor carga actual (chats
 * OPEN/PENDING), igual que antes. No hace nada si la cuenta no tiene
 * `autoAssignEnabled`. Devuelve el id del usuario asignado, o null si no
 * aplica o no hay candidatos disponibles.
 */
export async function autoAssignChat(accountId: string, chatId: string): Promise<string | null> {
  const account = await prisma.wAAccount.findUnique({
    where: { id: accountId },
    select: { autoAssignEnabled: true, autoAssignOnlineOnly: true },
  });
  if (!account?.autoAssignEnabled) return null;

  const candidates = await getEligibleAssignees(accountId);
  if (candidates.length === 0) return null;

  // "Solo en línea": se filtra antes de las reglas, así una regla que apunta a
  // alguien desconectado cae al balanceo entre los conectados (o a nadie).
  const candidateIds = await assignableCandidateIds(candidates.map((c) => c.id), account.autoAssignOnlineOnly);
  if (candidateIds.length === 0) return null;

  const [users, openCounts] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: candidateIds } },
      select: { id: true, maxOpenChats: true },
    }),
    prisma.wAChat.groupBy({
      by: ["assignedToId"],
      where: { accountId, assignedToId: { in: candidateIds }, status: { in: ["OPEN", "PENDING"] } },
      _count: { _all: true },
    }),
  ]);

  const maxByUser = new Map(users.map((u) => [u.id, u.maxOpenChats]));
  const loadByUser = new Map(openCounts.map((c) => [c.assignedToId as string, c._count._all]));

  const isUnderCap = (userId: string) => {
    const max = maxByUser.get(userId) ?? null;
    return max === null || (loadByUser.get(userId) ?? 0) < max;
  };

  const ruleAssignee = await resolveRuleBasedAssignee(accountId, chatId, candidateIds);
  if (ruleAssignee && isUnderCap(ruleAssignee)) {
    await prisma.wAChat.update({ where: { id: chatId }, data: { assignedToId: ruleAssignee } });
    return ruleAssignee;
  }

  let best: { id: string; load: number } | null = null;
  for (const candidateId of candidateIds) {
    if (!isUnderCap(candidateId)) continue;
    const load = loadByUser.get(candidateId) ?? 0;
    if (!best || load < best.load) best = { id: candidateId, load };
  }

  if (!best) return null;

  await prisma.wAChat.update({
    where: { id: chatId },
    data: { assignedToId: best.id },
  });

  return best.id;
}

// Evalúa las reglas de la cuenta en orden contra las señales en vivo del chat
// (tags del contacto, leadOrigin, label del score de IA más reciente de
// cualquier calificador) y devuelve el primer match. Filtrar por
// `assignedToId: { in: candidateIds }` en la query descarta de una vez las
// reglas cuyo destinatario ya perdió acceso a la cuenta desde que se creó la
// regla — no hace falta una segunda validación después.
async function resolveRuleBasedAssignee(
  accountId: string,
  chatId: string,
  candidateIds: string[]
): Promise<string | null> {
  const rules = await prisma.wAAccountRoutingRule.findMany({
    where: { waAccountId: accountId, assignedToId: { in: candidateIds } },
    orderBy: { order: "asc" },
    select: { conditionType: true, conditionValue: true, assignedToId: true },
  });
  if (rules.length === 0) return null;

  const chat = await prisma.wAChat.findUnique({
    where: { id: chatId },
    select: {
      contact: {
        select: {
          leadOrigin: true,
          tags: { select: { tagId: true } },
        },
      },
    },
  });
  if (!chat?.contact) return null;

  const tagIds = new Set(chat.contact.tags.map((t) => t.tagId));
  const leadOrigin = chat.contact.leadOrigin;

  // El score más reciente de CUALQUIER calificador para este chat — una regla
  // SCORE_LABEL no distingue de qué WALeadScorerBot vino, solo el label.
  const needsScore = rules.some((r) => r.conditionType === "SCORE_LABEL");
  const latestScore = needsScore
    ? await prisma.wALeadScore.findFirst({
        where: { chatId },
        orderBy: { updatedAt: "desc" },
        select: { label: true },
      })
    : null;

  for (const rule of rules) {
    const matches =
      rule.conditionType === "TAG"
        ? tagIds.has(rule.conditionValue)
        : rule.conditionType === "LEAD_ORIGIN"
          ? leadOrigin === rule.conditionValue
          : latestScore?.label === rule.conditionValue;
    if (matches) return rule.assignedToId;
  }
  return null;
}
