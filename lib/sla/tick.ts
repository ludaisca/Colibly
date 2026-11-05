import { prisma } from "@/lib/prisma";
import { isOrgWritable } from "@/lib/billing/gates";
import { displayName } from "@/lib/chats/display-name";
import { queuePush } from "@/lib/notifications/push";
import { formatSlaMinutes, slaCandidateCutoffs, slaState, type BusinessHours, type SlaConfig } from "./rules";

// Tick del SLA (cola `inbox`, job `sla-tick`, cada 5 min):
//  1. limpia los avisos que ya no corresponden al reloj actual (contestaron,
//     se resolvió, empezó otro ciclo) — así `sla*BreachedFor` no nulo
//     significa siempre "fuera de SLA ahora" y sirve de filtro en la bandeja;
//  2. por organización con el SLA encendido y escribible: chats abiertos cuyo
//     reloj venció → sella el inicio del reloj (reclamo atómico, un aviso por
//     reloj) y avisa en la campana + push a la persona asignada, o a los
//     admins si nadie lo tiene.
// No manda mensajes al cliente ni gasta IA: solo avisa al equipo.

const BATCH = 200;

export interface SlaTickResult {
  organizations: number;
  responseBreaches: number;
  resolutionBreaches: number;
  cleared: number;
  errors: number;
}

// 1. Reconciliar: avisos de un reloj que ya no corre o que cambió.
async function clearStaleBreaches(): Promise<number> {
  const counts = await Promise.all([
    prisma.$executeRaw`UPDATE "wa_chats" SET "sla_response_breached_for" = NULL
      WHERE "sla_response_breached_for" IS NOT NULL
        AND ("status" <> 'OPEN' OR "waiting_since" IS NULL OR "waiting_since" > "sla_response_breached_for")`,
    prisma.$executeRaw`UPDATE "wa_chats" SET "sla_resolution_breached_for" = NULL
      WHERE "sla_resolution_breached_for" IS NOT NULL
        AND ("status" <> 'OPEN' OR COALESCE("opened_at", "created_at") > "sla_resolution_breached_for")`,
    prisma.$executeRaw`UPDATE "conversations" SET "sla_response_breached_for" = NULL
      WHERE "sla_response_breached_for" IS NOT NULL
        AND ("status" <> 'OPEN' OR "waiting_since" IS NULL OR "waiting_since" > "sla_response_breached_for")`,
    prisma.$executeRaw`UPDATE "conversations" SET "sla_resolution_breached_for" = NULL
      WHERE "sla_resolution_breached_for" IS NOT NULL
        AND ("status" <> 'OPEN' OR COALESCE("opened_at", "created_at") > "sla_resolution_breached_for")`,
  ]);
  return counts.reduce((a, b) => a + b, 0);
}

interface Candidate {
  kind: "whatsapp" | "channel";
  id: string;
  accountId: string;
  name: string | null;
  handle: string | null;
  assignedToId: string | null;
  status: string;
  snoozedUntil: Date | null;
  waitingSince: Date | null;
  openedAt: Date | null;
  createdAt: Date;
}

const chatSelect = {
  id: true,
  name: true,
  assignedToId: true,
  status: true,
  snoozedUntil: true,
  waitingSince: true,
  openedAt: true,
  createdAt: true,
} as const;

async function candidates(organizationId: string, clock: "response" | "resolution", cutoff: Date, now: Date): Promise<Candidate[]> {
  const notSnoozed = { OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }] };
  const clockWhere =
    clock === "response"
      ? { waitingSince: { lte: cutoff }, slaResponseBreachedFor: null }
      : { slaResolutionBreachedFor: null, OR: [{ openedAt: { lte: cutoff } }, { openedAt: null, createdAt: { lte: cutoff } }] };
  const orderBy = clock === "response" ? { waitingSince: "asc" as const } : { createdAt: "asc" as const };

  const [wa, ch] = await Promise.all([
    prisma.wAChat.findMany({
      where: { account: { organizationId }, status: "OPEN", AND: [notSnoozed, clockWhere] },
      orderBy,
      take: BATCH,
      select: { ...chatSelect, accountId: true, remoteJid: true },
    }),
    prisma.conversation.findMany({
      where: { channelAccount: { organizationId }, status: "OPEN", AND: [notSnoozed, clockWhere] },
      orderBy,
      take: BATCH,
      select: { ...chatSelect, channelAccountId: true, externalId: true },
    }),
  ]);
  return [
    ...wa.map((c) => ({ ...c, kind: "whatsapp" as const, accountId: c.accountId, handle: c.remoteJid })),
    ...ch.map((c) => ({ ...c, kind: "channel" as const, accountId: c.channelAccountId, handle: c.externalId })),
  ];
}

async function claim(c: Candidate, clock: "response" | "resolution", startedAt: Date): Promise<boolean> {
  const field = clock === "response" ? "slaResponseBreachedFor" : "slaResolutionBreachedFor";
  const where = { id: c.id, status: "OPEN" as const, [field]: null };
  const data = { [field]: startedAt };
  const { count } =
    c.kind === "whatsapp" ? await prisma.wAChat.updateMany({ where, data }) : await prisma.conversation.updateMany({ where, data });
  return count === 1;
}

async function recipients(organizationId: string, assignedToId: string | null): Promise<string[]> {
  if (assignedToId) {
    const user = await prisma.user.findFirst({ where: { id: assignedToId, organizationId, disabledAt: null }, select: { id: true } });
    if (user) return [user.id];
  }
  const admins = await prisma.user.findMany({ where: { organizationId, role: "admin", disabledAt: null }, select: { id: true } });
  return admins.map((a) => a.id);
}

async function notifyBreach(organizationId: string, c: Candidate, clock: "response" | "resolution", config: SlaConfig): Promise<void> {
  const who = displayName(c.name, c.handle, "Un cliente");
  const title =
    clock === "response"
      ? `SLA vencido: ${who} espera respuesta`
      : `SLA vencido: el chat con ${who} sigue sin resolverse`;
  const body =
    clock === "response"
      ? `Pasó el tiempo de respuesta de ${formatSlaMinutes(config.responseMinutes)}${c.assignedToId ? "" : " y el chat no tiene a nadie asignado"}.`
      : `Pasó el tiempo de resolución de ${formatSlaMinutes(config.resolutionHours * 60)}.`;
  const link = `/whatsapp/chat/${c.accountId}/${c.id}`;
  const userIds = await recipients(organizationId, c.assignedToId);
  if (userIds.length === 0) return;
  await prisma.notification.createMany({ data: userIds.map((userId) => ({ userId, type: "SLA_BREACH" as const, title, body, link })) });
  // Mismo tag por chat y reloj: el navegador reemplaza el aviso anterior.
  await Promise.all(userIds.map((userId) => queuePush(userId, { title, body, link, tag: `sla:${clock}:${c.id}` })));
}

export async function processSlaTick(now = new Date()): Promise<SlaTickResult> {
  const result: SlaTickResult = { organizations: 0, responseBreaches: 0, resolutionBreaches: 0, cleared: 0, errors: 0 };
  try {
    result.cleared = await clearStaleBreaches();
  } catch (error) {
    result.errors++;
    console.error("[sla] no se pudieron limpiar los avisos viejos", error);
  }

  const orgs = await prisma.organization.findMany({
    where: { slaEnabledAt: { not: null } },
    select: {
      id: true,
      slaEnabledAt: true,
      slaResponseMinutes: true,
      slaResolutionHours: true,
      slaBusinessHoursOnly: true,
      timezone: true,
      businessHourStart: true,
      businessHourEnd: true,
      businessDays: true,
    },
  });

  for (const org of orgs) {
    if (!(await isOrgWritable(org.id))) continue;
    result.organizations++;
    const config: SlaConfig = {
      enabledAt: org.slaEnabledAt,
      responseMinutes: org.slaResponseMinutes,
      resolutionHours: org.slaResolutionHours,
      businessHoursOnly: org.slaBusinessHoursOnly,
    };
    const hours: BusinessHours = { timezone: org.timezone, startHour: org.businessHourStart, endHour: org.businessHourEnd, days: org.businessDays };
    const cutoffs = slaCandidateCutoffs(config, now);

    for (const clock of ["response", "resolution"] as const) {
      // Ningún reloj empieza antes de encender el SLA: si el corte es anterior, nada puede haber vencido.
      if (cutoffs[clock].getTime() < org.slaEnabledAt!.getTime()) continue;
      try {
        for (const c of await candidates(org.id, clock, cutoffs[clock], now)) {
          const state = slaState(c, config, hours, now)[clock];
          if (!state?.breached) continue;
          if (!(await claim(c, clock, state.startedAt))) continue;
          if (clock === "response") result.responseBreaches++;
          else result.resolutionBreaches++;
          await notifyBreach(org.id, c, clock, config).catch((error) => {
            result.errors++;
            console.error(`[sla] no se pudo avisar del chat ${c.id}`, error);
          });
        }
      } catch (error) {
        result.errors++;
        console.error(`[sla] falló la organización ${org.id} (${clock})`, error);
      }
    }
  }
  if (result.responseBreaches || result.resolutionBreaches || result.errors) console.log("[sla]", JSON.stringify(result));
  return result;
}
