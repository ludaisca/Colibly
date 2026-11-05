import { prisma } from "@/lib/prisma";
import { getEligibleChannelAssignees } from "@/lib/chat-assignees";
import { assignableCandidateIds } from "@/lib/users/availability";
import { channelHasFeature } from "@/lib/billing/entitlements";
import { chatTeamMemberIds } from "@/lib/teams/teams";
import { teamCandidateIds } from "@/lib/teams/rules";

// Equivalente de lib/whatsapp/auto-assign.ts para ChannelAccount (Telegram,
// Messenger, Instagram, Web), sin reglas de enrutamiento: asigna al candidato
// elegible (dueño + ChannelAccountShare, sin desactivados) con menos
// conversaciones OPEN/PENDING en la cuenta, respetando maxOpenChats.
export async function autoAssignConversation(channelAccountId: string, conversationId: string): Promise<string | null> {
  const account = await prisma.channelAccount.findUnique({
    where: { id: channelAccountId },
    select: { autoAssignEnabled: true, autoAssignOnlineOnly: true },
  });
  if (!account?.autoAssignEnabled) return null;
  // Depende de la licencia del dueño del canal (regla 3 de las licencias).
  if (!(await channelHasFeature({ channelAccountId }, "autoAssign"))) return null;

  const candidates = await getEligibleChannelAssignees(channelAccountId);
  if (candidates.length === 0) return null;
  // Con equipo, solo a sus miembros (lib/teams/rules.ts).
  const inTeam = teamCandidateIds(candidates.map((c) => c.id), await chatTeamMemberIds("channel", conversationId));
  const candidateIds = await assignableCandidateIds(inTeam, account.autoAssignOnlineOnly);
  if (candidateIds.length === 0) return null;

  const [users, openCounts] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: candidateIds } }, select: { id: true, maxOpenChats: true } }),
    prisma.conversation.groupBy({
      by: ["assignedToId"],
      where: { channelAccountId, assignedToId: { in: candidateIds }, status: { in: ["OPEN", "PENDING"] } },
      _count: { _all: true },
    }),
  ]);
  const maxByUser = new Map(users.map((u) => [u.id, u.maxOpenChats]));
  const loadByUser = new Map(openCounts.map((c) => [c.assignedToId as string, c._count._all]));

  let best: { id: string; load: number } | null = null;
  for (const id of candidateIds) {
    const load = loadByUser.get(id) ?? 0;
    const max = maxByUser.get(id) ?? null;
    if (max !== null && load >= max) continue;
    if (!best || load < best.load) best = { id, load };
  }
  if (!best) return null;

  await prisma.conversation.update({ where: { id: conversationId }, data: { assignedToId: best.id } });
  return best.id;
}
