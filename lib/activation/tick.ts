import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { appUrl, sendEmailSafely } from "@/lib/email/mailer";
import { activationNudgeTemplate } from "@/lib/email/templates";
import { daysUntil, TRIAL_REMINDER_DAYS } from "@/lib/billing/state";
import { ACTIVATION_WINDOW_DAYS, nextNudge, type ActivationStamps, type NudgeKey } from "./rules";
import { nudgeUnsubscribeUrl } from "./unsubscribe";

// Tick de activación (corre dentro del billing-tick, cada hora):
//  1. crea la fila OrgActivation de las organizaciones recientes que no la tienen;
//  2. sella los hitos que faltan con la fecha real del primer hecho (la primera
//     vez rellena el historial: una organización de hace un mes queda con sus
//     fechas de verdad, no con la de hoy);
//  3. manda, si toca, un consejo al dueño (lib/activation/rules.ts:nextNudge).
// Cada sello se calcula solo mientras está vacío, así que una organización ya
// activada deja de costar consultas. Las consultas usan MIN (aggregate), no
// findFirst + orderBy: con ORDER BY … LIMIT 1 Postgres puede recorrer el índice
// de createdAt de toda la tabla para una organización sin mensajes.

const BATCH = 100;
const DAY = 24 * 60 * 60 * 1000;

export const NUDGE_PATH: Record<NudgeKey, string> = {
  channel: "/whatsapp/cuentas",
  first_message: "/whatsapp/chat",
  automation: "/whatsapp/bots",
  team: "/usuarios",
};

type StampKey = keyof ActivationStamps;
const STAMP_KEYS: StampKey[] = ["emailVerifiedAt", "channelAt", "firstInboundAt", "firstReplyAt", "automationAt", "teamAt", "paidAt"];

function earliest(...dates: Array<Date | null | undefined>): Date | null {
  const valid = dates.filter((d): d is Date => d instanceof Date);
  return valid.length ? new Date(Math.min(...valid.map((d) => d.getTime()))) : null;
}

const HUMAN_OR_BOT_REPLY = { OR: [{ senderId: { not: null } }, { sentVia: { in: ["agent", "bot"] } }] };

interface OrgForStamps {
  id: string;
  ownerId: string | null;
  status: string;
  stripeSubscriptionId: string | null;
  owner: { emailVerifiedAt: Date | null } | null;
}

// Fecha del primer hecho de cada hito pendiente (null si aún no ocurre).
async function detect(org: OrgForStamps, missing: StampKey[], now: Date): Promise<Partial<ActivationStamps>> {
  const organizationId = org.id;
  const found: Partial<ActivationStamps> = {};
  const want = new Set(missing);

  if (want.has("emailVerifiedAt") && org.owner?.emailVerifiedAt) found.emailVerifiedAt = org.owner.emailVerifiedAt;

  if (want.has("channelAt")) {
    const [wa, ch] = await Promise.all([
      prisma.wAAccount.aggregate({ where: { organizationId }, _min: { createdAt: true } }),
      prisma.channelAccount.aggregate({ where: { organizationId }, _min: { createdAt: true } }),
    ]);
    found.channelAt = earliest(wa._min.createdAt, ch._min.createdAt);
  }

  // Mensajes: solo tiene sentido buscarlos si ya hay un canal.
  const hasChannel = !!found.channelAt || !want.has("channelAt");
  if (hasChannel && want.has("firstInboundAt")) {
    const [wa, ch] = await Promise.all([
      prisma.wAMessage.aggregate({
        where: { direction: "INBOUND", origin: "API", chat: { account: { organizationId } } },
        _min: { createdAt: true },
      }),
      prisma.channelMessage.aggregate({
        where: { direction: "INBOUND", conversation: { channelAccount: { organizationId } } },
        _min: { createdAt: true },
      }),
    ]);
    found.firstInboundAt = earliest(wa._min.createdAt, ch._min.createdAt);
  }
  if (hasChannel && want.has("firstReplyAt")) {
    const [wa, ch] = await Promise.all([
      prisma.wAMessage.aggregate({
        where: { direction: "OUTBOUND", origin: "API", chat: { account: { organizationId } }, ...HUMAN_OR_BOT_REPLY },
        _min: { createdAt: true },
      }),
      prisma.channelMessage.aggregate({
        where: { direction: "OUTBOUND", conversation: { channelAccount: { organizationId } }, ...HUMAN_OR_BOT_REPLY },
        _min: { createdAt: true },
      }),
    ]);
    found.firstReplyAt = earliest(wa._min.createdAt, ch._min.createdAt);
  }

  if (want.has("automationAt")) {
    const [bot, automation] = await Promise.all([
      prisma.wABot.aggregate({ where: { organizationId }, _min: { createdAt: true } }),
      prisma.automation.aggregate({ where: { organizationId }, _min: { createdAt: true } }),
    ]);
    found.automationAt = earliest(bot._min.createdAt, automation._min.createdAt);
  }

  if (want.has("teamAt")) {
    const [member, invite] = await Promise.all([
      prisma.user.aggregate({ where: { organizationId, ...(org.ownerId ? { id: { not: org.ownerId } } : {}) }, _min: { createdAt: true } }),
      prisma.authToken.aggregate({ where: { organizationId, type: "INVITE" }, _min: { createdAt: true } }),
    ]);
    // Sin dueño registrado no se sabe quién es "el resto": se exige más de uno.
    const memberAt = org.ownerId ? member._min.createdAt : (await prisma.user.count({ where: { organizationId } })) > 1 ? member._min.createdAt : null;
    found.teamAt = earliest(memberAt, invite._min.createdAt);
  }

  // El primer pago se ve como "activa con suscripción"; la fecha es la de la
  // primera vez que el tick lo observa (a lo más una hora de diferencia).
  if (want.has("paidAt") && org.status === "ACTIVE" && org.stripeSubscriptionId) found.paidAt = now;

  return found;
}

export async function processActivationTick(now = new Date()): Promise<void> {
  const since = new Date(now.getTime() - ACTIVATION_WINDOW_DAYS * DAY);

  // 1. Filas para las organizaciones recientes que aún no la tienen.
  const withoutRow = await prisma.organization.findMany({
    where: { isInternal: false, createdAt: { gte: since }, activation: null },
    select: { id: true },
    take: 500,
  });
  if (withoutRow.length) {
    await prisma.orgActivation.createMany({ data: withoutRow.map((o) => ({ organizationId: o.id, checkedAt: new Date(0) })), skipDuplicates: true });
  }

  // 2 y 3. Las pendientes de algún sello o en prueba (para los consejos), las
  // revisadas hace más tiempo primero.
  const incomplete: Prisma.OrgActivationWhereInput[] = STAMP_KEYS.map((k) => ({ [k]: null }));
  const rows = await prisma.orgActivation.findMany({
    where: {
      organization: { isInternal: false, createdAt: { gte: since } },
      OR: [...incomplete, { organization: { status: "TRIALING" } }],
    },
    orderBy: { checkedAt: "asc" },
    take: BATCH,
    include: {
      organization: {
        select: {
          id: true,
          name: true,
          ownerId: true,
          status: true,
          isInternal: true,
          createdAt: true,
          trialEndsAt: true,
          stripeSubscriptionId: true,
          owner: { select: { email: true, name: true, emailVerifiedAt: true, disabledAt: true } },
        },
      },
    },
  });

  for (const row of rows) {
    const org = row.organization;
    try {
      const missing = STAMP_KEYS.filter((k) => !row[k]);
      const found = missing.length ? await detect(org, missing, now) : {};
      const stamps: ActivationStamps = Object.fromEntries(STAMP_KEYS.map((k) => [k, row[k] ?? found[k] ?? null])) as unknown as ActivationStamps;
      const newStamps = Object.fromEntries(Object.entries(found).filter(([, v]) => v)) as Partial<ActivationStamps>;
      // Solo se escriben los sellos que estaban vacíos al leer la fila.
      await prisma.orgActivation.update({ where: { organizationId: org.id }, data: { ...newStamps, checkedAt: now } });

      const owner = org.owner;
      const key = nextNudge({
        now,
        createdAt: org.createdAt,
        status: org.status,
        isInternal: org.isInternal,
        ownerVerified: !!owner?.emailVerifiedAt && !owner.disabledAt,
        optOut: row.nudgesOptOut,
        trialDaysLeft: org.trialEndsAt ? daysUntil(org.trialEndsAt, now) : null,
        billingReminderDays: TRIAL_REMINDER_DAYS,
        stamps,
        sent: row.nudgesSent,
        lastNudgeAt: row.lastNudgeAt,
      });
      if (!key || !owner) continue;

      // Reclamo atómico: con dos procesos corriendo el tick, solo uno lo manda.
      const { count } = await prisma.orgActivation.updateMany({
        where: { organizationId: org.id, lastNudgeAt: row.lastNudgeAt, NOT: { nudgesSent: { has: key } }, nudgesOptOut: false },
        data: { nudgesSent: { push: key }, lastNudgeAt: now },
      });
      if (count !== 1) continue;
      await sendEmailSafely(
        activationNudgeTemplate({
          to: owner.email,
          name: owner.name,
          kind: key,
          url: appUrl(NUDGE_PATH[key]),
          unsubscribeUrl: nudgeUnsubscribeUrl(org.id),
        }),
        `consejo de activación (${key})`
      );
    } catch (err) {
      console.error(`[activation-tick] Organización ${org.id}:`, err);
    }
  }
}
