import { NextResponse } from "next/server";
import type { Organization } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { invalidateOrgApiAccess } from "@/lib/api/auth-cache";
import { limitsForSeats, PLANS, SEAT_CHANNEL_LABELS, SEAT_CHANNELS, type PlanLimits, type SeatChannel } from "./plans";
import { catalogMode, countLicenses, orgLicenseLimits, type LicenseCounts } from "./licenses";
import type { SeatUsage } from "./state";
import { accessMode, channelSeatBase, planLimits, seatCap, type AccessMode, type BillingSnapshot } from "./state";

// Candados de facturación del servidor: estado de la suscripción (¿puede
// escribir y enviar?) y límites del plan. Las APIs responden 402 con un
// `code` estable que la UI puede reconocer: "read_only" o "plan_limit".

export type OrgBilling = BillingSnapshot &
  Pick<Organization, "id" | "name" | "aiCreditsUsed" | "aiCreditsBonus" | "aiCreditsPeriodStart" | "stripeCustomerId" | "stripeSubscriptionId" | "canceledAt" | "legacyUntil">;

// Caché corto: se consulta en cada envío y en cada mutación de la UI. Un
// cambio de estado (webhook de Stripe, tick) invalida el de su organización en
// este proceso; en otros procesos tarda como mucho CACHE_MS.
const CACHE_MS = 15_000;
const cache = new Map<string, { value: OrgBilling | null; at: number }>();

export async function getOrgBilling(organizationId: string): Promise<OrgBilling | null> {
  const hit = cache.get(organizationId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const value = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
      name: true,
      plan: true,
      status: true,
      isInternal: true,
      trialEndsAt: true,
      graceEndsAt: true,
      currentPeriodEnd: true,
      cancelAtPeriodEnd: true,
      seatQuantity: true,
      canceledAt: true,
      aiCreditsUsed: true,
      aiCreditsBonus: true,
      aiCreditsPeriodStart: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      legacyUntil: true,
    },
  });
  cache.set(organizationId, { value, at: Date.now() });
  return value;
}

export function invalidateOrgBilling(organizationId: string) {
  cache.delete(organizationId);
  // También el caché de acceso de la API pública (Redis, todas las instancias).
  void invalidateOrgApiAccess(organizationId);
}

export async function getOrgAccess(organizationId: string): Promise<AccessMode> {
  const org = await getOrgBilling(organizationId);
  return org ? accessMode(org, new Date()) : "suspended";
}

export async function isOrgWritable(organizationId: string): Promise<boolean> {
  return (await getOrgAccess(organizationId)) === "full";
}

// ── Envíos ──

export class BillingBlockedError extends Error {
  constructor() {
    super("La suscripción de esta organización no está activa: los envíos están en pausa");
    this.name = "BillingBlockedError";
  }
}

// Respaldo en los emisores de bajo nivel (WhatsApp, Telegram, Messenger,
// Instagram, widget): aunque un llamador olvide su propio candado, en solo
// lectura no sale nada.
export async function assertOrgCanSend(organizationId: string): Promise<void> {
  if (!(await isOrgWritable(organizationId))) throw new BillingBlockedError();
}

const accountOrgCache = new Map<string, string>();

// Organización de una cuenta (WhatsApp o canal) — no cambia nunca, así que se
// cachea sin vencimiento. Para los workers que solo conocen el id de la cuenta.
export async function orgIdForAccount(ref: { waAccountId?: string | null; channelAccountId?: string | null }): Promise<string | null> {
  const key = ref.waAccountId ? `wa:${ref.waAccountId}` : ref.channelAccountId ? `ch:${ref.channelAccountId}` : null;
  if (!key) return null;
  const cached = accountOrgCache.get(key);
  if (cached) return cached;
  const row = ref.waAccountId
    ? await prisma.wAAccount.findUnique({ where: { id: ref.waAccountId }, select: { organizationId: true } })
    : await prisma.channelAccount.findUnique({ where: { id: ref.channelAccountId! }, select: { organizationId: true } });
  if (row) accountOrgCache.set(key, row.organizationId);
  return row?.organizationId ?? null;
}

export async function isAccountWritable(ref: { waAccountId?: string | null; channelAccountId?: string | null }): Promise<boolean> {
  const organizationId = await orgIdForAccount(ref);
  return organizationId ? isOrgWritable(organizationId) : false;
}

const botOrgCache = new Map<string, string>();

// Los workers de bots solo conocen el id del bot (que lleva organizationId).
export async function isBotWritable(botId: string): Promise<boolean> {
  let organizationId = botOrgCache.get(botId);
  if (!organizationId) {
    const bot = await prisma.wABot.findUnique({ where: { id: botId }, select: { organizationId: true } });
    if (!bot) return false;
    organizationId = bot.organizationId;
    botOrgCache.set(botId, organizationId);
  }
  return isOrgWritable(organizationId);
}

// ── Respuestas 402 ──

export function readOnlyResponse() {
  return NextResponse.json(
    {
      error: "Tu cuenta está en solo lectura: puedes ver tus datos, pero no hacer cambios ni enviar mensajes. Activa tu plan en Configuración → Plan y facturación.",
      code: "read_only",
    },
    { status: 402 }
  );
}

// seats: usuarios activos + invitaciones pendientes (dueño y admins incluidos).
// whatsapp: números de WhatsApp (1 por asiento). channels: Telegram/Messenger/
// Instagram (el widget web no cuenta).
export type LimitKey = "seats" | "whatsapp" | SeatChannel | "webchat" | "contacts" | "activeLeads" | "activeAutomations" | "funnels" | "customFields" | "aiAgents";

/** Licencias de las personas activas de la organización, por plan. */
export async function activeLicenseCounts(organizationId: string): Promise<LicenseCounts> {
  const users = await prisma.user.findMany({ where: { organizationId, disabledAt: null }, select: { license: true } });
  return countLicenses(users.map((u) => u.license));
}

export type EffectiveLimits = PlanLimits & { webchat: boolean; webchatAccounts: number };

/**
 * Límites de la organización según el catálogo que la rige. Con licencias:
 * contactos y leads suman las licencias de las personas activas, embudos y
 * campos son los de la licencia más alta, y cabe un canal de cada tipo por
 * licencia. Automatizaciones y agentes no tienen tope de cantidad: los decide
 * la licencia de quien publica y la del dueño del canal (entitlements.ts).
 */
export async function effectiveOrgLimits(org: OrgBilling): Promise<EffectiveLimits> {
  const base = planLimits(org);
  if (catalogMode(org, new Date()) !== "license") return { ...base, webchatAccounts: Infinity };
  const l = orgLicenseLimits(await activeLicenseCounts(org.id));
  return {
    ...base,
    contacts: l.contacts,
    activeLeads: l.activeLeads,
    funnels: l.funnels,
    customFields: l.customFields,
    whatsapp: l.channelsPerType,
    telegram: l.channelsPerType,
    messenger: l.channelsPerType,
    instagram: l.channelsPerType,
    webchatAccounts: l.channelsPerType,
    activeAutomations: Infinity,
    aiAgents: Infinity,
  };
}

export type OrgUsage = Omit<SeatUsage, "apiKeys" | "webhooks">;

export async function getOrgUsage(organizationId: string): Promise<OrgUsage> {
  const [users, invites, whatsapp, telegram, messenger, instagram, webchat, contacts, activeLeads, activeAutomations, funnels, customFields, aiAgents] = await Promise.all([
    prisma.user.count({ where: { organizationId, disabledAt: null } }),
    prisma.authToken.count({ where: { organizationId, type: "INVITE", usedAt: null, expiresAt: { gt: new Date() } } }),
    prisma.wAAccount.count({ where: { organizationId } }),
    // 1 cuenta de cada tipo por asiento (el widget web no cuenta).
    prisma.channelAccount.count({ where: { organizationId, channel: "TELEGRAM" } }),
    prisma.channelAccount.count({ where: { organizationId, channel: "MESSENGER" } }),
    prisma.channelAccount.count({ where: { organizationId, channel: "INSTAGRAM" } }),
    prisma.channelAccount.count({ where: { organizationId, channel: "WEBCHAT" } }),
    prisma.contact.count({ where: { OR: [{ account: { organizationId } }, { channelAccount: { organizationId } }] } }),
    prisma.contact.count({
      where: {
        leadStatus: { notIn: ["CUSTOMER", "LOST"] },
        OR: [{ account: { organizationId } }, { channelAccount: { organizationId } }],
      },
    }),
    prisma.automation.count({ where: { organizationId, status: "ACTIVE" } }),
    prisma.pipeline.count({ where: { organizationId } }),
    prisma.contactCustomFieldDefinition.count({
      where: { OR: [{ waAccount: { organizationId } }, { channelAccount: { organizationId } }] },
    }),
    prisma.wABot.count({ where: { organizationId } }),
  ]);
  return { seats: users + invites, whatsapp, telegram, messenger, instagram, webchat, contacts, activeLeads, activeAutomations, funnels, customFields, aiAgents };
}

// Uso completo para evaluar un cambio de plan o de asientos (planChangeImpact).
export async function getSeatUsage(organizationId: string): Promise<SeatUsage> {
  const [usage, apiKeys, webhooks] = await Promise.all([
    getOrgUsage(organizationId),
    prisma.apiKey.count({ where: { organizationId, revokedAt: null } }),
    prisma.webhookEndpoint.count({ where: { organizationId, active: true } }),
  ]);
  return { ...usage, apiKeys, webhooks };
}

// Pantalla del plan (cambiar de plan).
export const BILLING_PLAN_PATH = "/configuracion/plan";

// Adonde mandar a un admin que se quedó sin asientos.
export const BILLING_SEATS_PATH = "/configuracion/plan#asientos";

// Adonde mandar a un admin que necesita otro ejecutivo (invitarlo).
export const USERS_PATH = "/usuarios";

const PER_SEAT_KEYS: readonly LimitKey[] = ["whatsapp", ...SEAT_CHANNELS];
const isPerSeatKey = (key: LimitKey) => PER_SEAT_KEYS.includes(key);

export interface PerSeatContext {
  trialing: boolean;
  activeUsers: number;
  // Asientos disponibles para sumar ejecutivos (prueba: TRIAL_MAX_SEATS).
  seatCap: number;
}

// Mensaje cuando el cupo de un canal ya está lleno. Si quedan usuarios por
// comprar o invitar, el remedio es sumar uno: en los planes con fórmula
// "incluidos + 1 por usuario extra" eso abre otro canal.
export function perSeatLimitMessage(key: LimitKey, max: number, ctx: PerSeatContext): { message: string; actionUrl: string } {
  const whatPlural = key === "whatsapp" ? (max === 1 ? "número de WhatsApp" : "números de WhatsApp") : max === 1 ? `cuenta de ${SEAT_CHANNEL_LABELS[key as SeatChannel]}` : `cuentas de ${SEAT_CHANNEL_LABELS[key as SeatChannel]}`;
  const base = `Tu plan permite ${max} ${whatPlural} y ya los tienes.`;
  if (ctx.activeUsers < ctx.seatCap) {
    return {
      message: `${base} Invita a otro usuario en Usuarios${ctx.trialing ? ` (la prueba gratis incluye hasta ${ctx.seatCap} usuarios)` : ""}; cuando acepte la invitación podrás conectar otro.`,
      actionUrl: USERS_PATH,
    };
  }
  return {
    message: ctx.trialing
      ? `${base} La prueba gratis incluye hasta ${ctx.seatCap} usuarios; elige un plan en Configuración → Plan y facturación para agregar más.`
      : `${base} Agrega un usuario en Configuración → Plan y facturación e invítalo para conectar otro.`,
    actionUrl: BILLING_SEATS_PATH,
  };
}

function limitMessage(key: LimitKey, planName: string, max: number, trialing: boolean, planMaxSeats = Infinity): string {
  switch (key) {
    case "seats":
      if (!trialing && max >= planMaxSeats) {
        return `Este plan admite hasta ${planMaxSeats} usuarios (el dueño y las invitaciones pendientes cuentan).`;
      }
      return trialing
        ? `La prueba gratis incluye hasta ${max} usuarios (las invitaciones pendientes cuentan). Elige un plan en Configuración → Plan y facturación para agregar más.`
        : `Tu organización paga ${max} ${max === 1 ? "usuario" : "usuarios"} y ya están ocupados (las invitaciones pendientes cuentan). Agrega un asiento en Configuración → Plan y facturación, o desactiva a alguien.`;
    case "whatsapp":
      return `Tu plan permite ${max} ${max === 1 ? "número de WhatsApp" : "números de WhatsApp"}. Agrega un usuario en Configuración → Plan y facturación para conectar otro.`;
    case "webchat":
      return `Tu plan permite ${max} ${max === 1 ? "chat web" : "chats web"}.`;
    case "telegram":
    case "messenger":
    case "instagram": {
      const label = SEAT_CHANNEL_LABELS[key];
      return `Tu plan permite ${max} ${max === 1 ? "cuenta" : "cuentas"} de ${label}. Agrega un usuario o cambia de plan para conectar otra.`;
    }
    case "contacts":
      return trialing
        ? `Llegaste al límite de ${max.toLocaleString("es-MX")} contactos de la prueba gratis. Los mensajes entrantes se siguen guardando; elige un plan para agregar más.`
        : `Llegaste al límite de ${max.toLocaleString("es-MX")} contactos de tu organización (plan ${planName}). Los mensajes entrantes se siguen guardando; agrega usuarios o mejora tu plan para agregar más.`;
    case "activeLeads":
      return `Llegaste al límite de ${max.toLocaleString("es-MX")} leads activos del plan ${planName}. Pasa leads a Cliente o Perdido, o agrega usuarios, para abrir más.`;
    case "activeAutomations":
      return max === 0
        ? `El plan ${planName} no incluye automatizaciones. Pasa a Avanzado o Pro para publicarlas.`
        : `Tu plan ${planName} permite ${max} ${max === 1 ? "automatización activa" : "automatizaciones activas"}. Pausa otra o mejora tu plan.`;
    case "funnels":
      return `Tu plan ${planName} permite ${max.toLocaleString("es-MX")} embudos y ya los tienes.`;
    case "customFields":
      return `Tu plan ${planName} permite ${max.toLocaleString("es-MX")} campos personalizados y ya los tienes.`;
    case "aiAgents":
      return max === 0
        ? `El plan ${planName} no incluye agentes de IA. Pasa a Avanzado o Pro para crearlos. En Básico quedan las sugerencias, los resúmenes y la asistencia de escritura.`
        : `Tu plan ${planName} permite ${max} ${max === 1 ? "agente de IA" : "agentes de IA"}. Elimina uno o mejora tu plan.`;
  }
}

export interface PlanLimitExceeded {
  limit: LimitKey;
  message: string;
  current: number;
  max: number;
  /** Dónde se resuelve: Usuarios (invitar) o Plan y facturación (asientos). */
  actionUrl?: string;
}

// null si cabe `adding` más; si no, el detalle para responder.
export async function evaluatePlanLimit(organizationId: string, key: LimitKey, adding = 1): Promise<PlanLimitExceeded | null> {
  const org = await getOrgBilling(organizationId);
  if (!org) return { limit: key, message: "Organización no encontrada", current: 0, max: 0 };
  const trialing = org.status === "TRIALING";
  if (catalogMode(org, new Date()) === "license" && key !== "seats") return evaluateLicenseLimit(org, key, adding);
  if (key === "webchat") return null;
  if (isPerSeatKey(key)) {
    if (org.isInternal) return null;
    const [usage, activeUsers] = await Promise.all([
      getOrgUsage(organizationId),
      prisma.user.count({ where: { organizationId, disabledAt: null } }),
    ]);
    const max = limitsForSeats(PLANS[org.plan], channelSeatBase(org, activeUsers))[key as "whatsapp" | SeatChannel];
    if (max === Infinity) return null;
    const current = usage[key];
    if (max === 0) {
      const label = key === "whatsapp" ? "WhatsApp" : SEAT_CHANNEL_LABELS[key as SeatChannel];
      return {
        limit: key,
        message: `Tu plan ${PLANS[org.plan].name} no incluye ${label}. Cambia de plan en Configuración → Plan y facturación para conectarlo.`,
        current,
        max: 0,
        actionUrl: BILLING_PLAN_PATH,
      };
    }
    if (current + adding <= max) return null;
    const { message, actionUrl } = perSeatLimitMessage(key, max, { trialing, activeUsers, seatCap: seatCap(org) });
    return { limit: key, message, current, max, actionUrl };
  }
  const max = planLimits(org)[key];
  if (max === Infinity) return null;
  const current = (await getOrgUsage(organizationId))[key];
  if (current + adding <= max) return null;
  return { limit: key, message: limitMessage(key, PLANS[org.plan].name, max, trialing, PLANS[org.plan].perOrg.maxSeats), current, max, ...(key === "seats" ? { actionUrl: BILLING_SEATS_PATH } : {}) };
}

// [con artículo, singular, plural, "otro/otra"]
const CHANNEL_LIMIT_LABELS: Partial<Record<LimitKey, [string, string, string, string]>> = {
  whatsapp: ["un número de WhatsApp", "número de WhatsApp", "números de WhatsApp", "otro"],
  telegram: ["una cuenta de Telegram", "cuenta de Telegram", "cuentas de Telegram", "otra"],
  messenger: ["una cuenta de Messenger", "cuenta de Messenger", "cuentas de Messenger", "otra"],
  instagram: ["una cuenta de Instagram", "cuenta de Instagram", "cuentas de Instagram", "otra"],
  webchat: ["un chat web", "chat web", "chats web", "otro"],
};

async function evaluateLicenseLimit(org: OrgBilling, key: LimitKey, adding: number): Promise<PlanLimitExceeded | null> {
  const limits = await effectiveOrgLimits(org);
  const max = key === "webchat" ? limits.webchatAccounts : (limits[key as keyof PlanLimits] as number);
  if (!Number.isFinite(max)) return null;
  const current = (await getOrgUsage(org.id))[key as keyof OrgUsage];
  if (current + adding <= max) return null;
  const fmt = (n: number) => n.toLocaleString("es-MX");
  const channel = CHANNEL_LIMIT_LABELS[key];
  if (channel) {
    return {
      limit: key,
      message: `Cada licencia incluye ${channel[0]} y tu organización tiene ${fmt(max)} ${max === 1 ? "licencia" : "licencias"} con ${fmt(current)} ${current === 1 ? channel[1] : channel[2]}. Agrega a otra persona en Usuarios para conectar ${channel[3]}.`,
      current,
      max,
      actionUrl: USERS_PATH,
    };
  }
  const what: Record<string, string> = {
    contacts: `Llegaste al límite de ${fmt(max)} contactos de tu organización (la suma de sus licencias). Los mensajes entrantes se siguen guardando; agrega personas o sube licencias para agregar más.`,
    activeLeads: `Llegaste al límite de ${fmt(max)} leads activos de tu organización (la suma de sus licencias). Pasa leads a Cliente o Perdido, o sube licencias, para abrir más.`,
    funnels: `Tu organización permite ${fmt(max)} ${max === 1 ? "embudo" : "embudos"} (según su licencia más alta) y ya los tiene.`,
    customFields: `Tu organización permite ${fmt(max)} campos personalizados (según su licencia más alta) y ya los tiene.`,
  };
  return { limit: key, message: what[key] ?? "Llegaste al límite de tu organización.", current, max, actionUrl: USERS_PATH };
}

// Igual que evaluatePlanLimit, como respuesta 402 lista para devolver.
export async function checkPlanLimit(organizationId: string, key: LimitKey, adding = 1): Promise<NextResponse | null> {
  const exceeded = await evaluatePlanLimit(organizationId, key, adding);
  if (!exceeded) return null;
  return NextResponse.json(
    {
      error: exceeded.message,
      code: "plan_limit",
      limit: key,
      current: exceeded.current,
      max: exceeded.max,
      // Asientos, WhatsApp y los canales por ejecutivo se resuelven agregando
      // asientos: la UI enlaza aquí.
      ...(exceeded.actionUrl ? { billingUrl: exceeded.actionUrl, actionUrl: exceeded.actionUrl } : key === "seats" ? { billingUrl: BILLING_SEATS_PATH } : {}),
    },
    { status: 402 }
  );
}


// API pública con el catálogo anterior (caché de acceso de lib/api/auth.ts).
// Con licencias manda la del dueño de la key: entitlements.integrationOwnerHas.
export async function hasApiAccess(organizationId: string): Promise<boolean> {
  const org = await getOrgBilling(organizationId);
  return !!org && planLimits(org).apiAccess;
}

export const AI_NOT_INCLUDED_MESSAGE = "Nadie en tu organización tiene una licencia con IA. Sube una licencia a Avanzado o Pro para usar sugerencias, bots y calificadores.";

// Chat web: los tres planes (además del flag del canal en /plataforma).
export async function checkWebchatAccess(organizationId: string): Promise<NextResponse | null> {
  const org = await getOrgBilling(organizationId);
  if (org && planLimits(org).webchat) return null;
  return NextResponse.json(
    { error: "El chat web no está incluido en tu plan.", code: "plan_limit", limit: "webchat", actionUrl: BILLING_PLAN_PATH },
    { status: 402 }
  );
}

// Los candados por función (bots, difusiones, calificación, IA, API,
// webhooks…) viven en entitlements.ts: dependen de la licencia de la persona,
// del dueño del canal o del dueño de la integración, no de la organización.
