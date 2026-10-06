import { NextResponse } from "next/server";
import type { Organization } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PLANS } from "./plans";
import { accessMode, planLimits, type AccessMode, type BillingSnapshot } from "./state";

// Candados de facturación del servidor: estado de la suscripción (¿puede
// escribir y enviar?) y límites del plan. Las APIs responden 402 con un
// `code` estable que la UI puede reconocer: "read_only" o "plan_limit".

export type OrgBilling = BillingSnapshot & Pick<Organization, "id" | "name" | "aiCreditsUsed" | "aiCreditsBonus" | "aiCreditsPeriodStart" | "stripeCustomerId" | "stripeSubscriptionId" | "canceledAt">;

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
      canceledAt: true,
      aiCreditsUsed: true,
      aiCreditsBonus: true,
      aiCreditsPeriodStart: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
    },
  });
  cache.set(organizationId, { value, at: Date.now() });
  return value;
}

export function invalidateOrgBilling(organizationId: string) {
  cache.delete(organizationId);
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

export type LimitKey = "users" | "channels" | "contacts" | "activeAutomations";

export interface OrgUsage {
  users: number; // activos + invitaciones pendientes
  channels: number; // sin contar el widget web
  contacts: number; // personas no archivadas
  activeAutomations: number;
}

export async function getOrgUsage(organizationId: string): Promise<OrgUsage> {
  const [users, invites, wa, channels, contacts, activeAutomations] = await Promise.all([
    prisma.user.count({ where: { organizationId, disabledAt: null } }),
    prisma.authToken.count({ where: { organizationId, type: "INVITE", usedAt: null, expiresAt: { gt: new Date() } } }),
    prisma.wAAccount.count({ where: { organizationId } }),
    prisma.channelAccount.count({ where: { organizationId, channel: { not: "WEBCHAT" } } }),
    // "Contactos" del plan = personas (no archivadas): una persona con varios
    // canales cuenta una sola vez.
    prisma.person.count({ where: { organizationId, archivedAt: null } }),
    prisma.automation.count({ where: { organizationId, status: "ACTIVE" } }),
  ]);
  return { users: users + invites, channels: wa + channels, contacts, activeAutomations };
}

function limitMessage(key: LimitKey, planName: string, max: number): string {
  switch (key) {
    case "users":
      return `Tu plan ${planName} permite ${max} usuarios (las invitaciones pendientes cuentan). Mejora tu plan o desactiva a alguien.`;
    case "channels":
      return `Tu plan ${planName} permite ${max} ${max === 1 ? "canal conectado" : "canales conectados"} (el widget web no cuenta). Mejora tu plan para conectar más.`;
    case "contacts":
      return `Llegaste al límite de ${max.toLocaleString("es-MX")} contactos de tu plan ${planName}. Los mensajes entrantes se siguen guardando; mejora tu plan para agregar más.`;
    case "activeAutomations":
      return `Tu plan ${planName} permite ${max} automatizaciones activas. Pausa otra o mejora tu plan.`;
  }
}

export interface PlanLimitExceeded {
  limit: LimitKey;
  message: string;
  current: number;
  max: number;
}

// null si cabe `adding` más; si no, el detalle para responder.
export async function evaluatePlanLimit(organizationId: string, key: LimitKey, adding = 1): Promise<PlanLimitExceeded | null> {
  const org = await getOrgBilling(organizationId);
  if (!org) return { limit: key, message: "Organización no encontrada", current: 0, max: 0 };
  const max = planLimits(org)[key];
  if (max === Infinity) return null;
  const current = (await getOrgUsage(organizationId))[key];
  if (current + adding <= max) return null;
  return { limit: key, message: limitMessage(key, PLANS[org.plan].name, max), current, max };
}

// Igual que evaluatePlanLimit, como respuesta 402 lista para devolver.
export async function checkPlanLimit(organizationId: string, key: LimitKey, adding = 1): Promise<NextResponse | null> {
  const exceeded = await evaluatePlanLimit(organizationId, key, adding);
  if (!exceeded) return null;
  return NextResponse.json(
    { error: exceeded.message, code: "plan_limit", limit: key, current: exceeded.current, max: exceeded.max },
    { status: 402 }
  );
}

// API pública y webhooks salientes: solo en planes que los incluyen.
export async function hasApiAccess(organizationId: string): Promise<boolean> {
  const org = await getOrgBilling(organizationId);
  return !!org && planLimits(org).apiAccess;
}

export async function checkApiAccess(organizationId: string): Promise<NextResponse | null> {
  if (await hasApiAccess(organizationId)) return null;
  return NextResponse.json(
    { error: "La API y los webhooks están incluidos en el plan Pro. Mejora tu plan para usarlos.", code: "plan_limit", limit: "apiAccess" },
    { status: 402 }
  );
}
