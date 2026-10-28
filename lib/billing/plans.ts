import type { PlanId } from "@prisma/client";
export type { PlanId };

// Catálogo de planes — ÚNICO lugar para cambiar precios y límites. Lo leen la
// landing (precios), los candados del servidor (lib/billing/gates.ts), la
// pantalla "Plan y facturación", el panel de plataforma y el generador del
// sitio de cPanel. Sin dependencias de servidor ni imports de valores (solo
// `import type`): se importa desde componentes cliente y desde Node directo
// (scripts/gen-cpanel-pricing.mjs, con type stripping).

// ── Precio por usuario (oferta pública, 2026-10-27) ──
// Se cobra por usuario: cada persona de la organización (dueño y admins
// incluidos) ocupa un asiento, y las invitaciones pendientes también. Mensual,
// en pesos mexicanos, sin plan anual. Los ids internos siguen siendo
// ESSENTIAL / BUSINESS / PRO; los nombres públicos son Básico, Avanzado y Pro.
// Contactos, leads activos y créditos de IA se suman por usuario. WhatsApp e
// Instagram usan la fórmula de la landing (incluidos + 1 por usuario extra, o
// sin tope). Telegram y Messenger no tienen tope. La prueba usa el plan Pro
// con TRIAL_MAX_SEATS usuarios: los límites sí se multiplican.
// scripts/gen-cpanel-pricing.mjs copia estos números al sitio de cPanel; el
// test lib/billing/__tests__/cpanel-pricing.test.ts falla si divergen.

export const PRICE_CURRENCY = "MXN" as const;
export const PRICE_UNIT = "MXN por usuario al mes";
// TODO(IVA): pendiente de confirmar con el contador si los precios incluyen IVA
// o son "más IVA". Mientras tanto, la copia pública solo dice "Precios en MXN"
// (PRICE_CURRENCY_NOTE), neutral sobre impuestos.
export const PRICE_CURRENCY_NOTE = "Precios en MXN.";
// Leyenda fiscal junto a cada precio público. null = no se muestra ninguna:
// hoy no se factura, así que la copia NO dice "incluye IVA" ni "verás el precio
// final con impuestos". Si eso cambia, se escribe aquí (p. ej. "más IVA") y
// aparece en la landing, /precios, términos, cPanel y la pantalla del plan a
// la vez.
export const PRICE_TAX_NOTE: string | null = null;

// Cómo crece un cupo con los usuarios de la organización.
// - perSeat: `each` por usuario.
// - includedPlus: `included` con el primer usuario y `perExtra` por cada uno más.
// - unlimited / none: sin tope, o el plan no lo incluye.
export type SeatQuota =
  | { kind: "none" }
  | { kind: "perSeat"; each: number }
  | { kind: "includedPlus"; included: number; perExtra: number }
  | { kind: "unlimited" };

export function resolveQuota(quota: SeatQuota, seats: number): number {
  if (quota.kind === "none") return 0;
  if (quota.kind === "unlimited") return Infinity;
  const n = Math.max(1, Math.floor(seats));
  if (quota.kind === "perSeat") return quota.each * n;
  return quota.included + quota.perExtra * Math.max(0, n - 1);
}

const includedPlus = (included: number): SeatQuota => ({ kind: "includedPlus", included, perExtra: 1 });
const UNLIMITED_QUOTA: SeatQuota = { kind: "unlimited" };

// Por usuario (se multiplica, o usa la fórmula includedPlus).
export interface PerSeatAllowances {
  whatsapp: SeatQuota;
  instagram: SeatQuota;
  // Telegram y Messenger: la oferta pública no los capa por usuario.
  telegram: SeatQuota;
  messenger: SeatQuota;
  contacts: number;
  // Leads activos: contactos que no están en Cliente ni Perdido.
  activeLeads: number;
  aiCreditsPerMonth: number;
}

// Por organización (no crecen con los usuarios).
export interface PerOrgAllowances {
  // Automatizaciones ACTIVAS a la vez (Infinity = sin límite, 0 = no incluidas).
  activeAutomations: number;
  apiAccess: boolean;
  // Webhooks salientes. La API pública puede estar en un plan que no los tiene.
  webhooks: boolean;
  // Difusiones de WhatsApp.
  campaigns: boolean;
  // Bots que responden solos y recuperación de leads. Las sugerencias y los
  // resúmenes usan aiAccess, que es más amplio.
  bots: boolean;
  // Calificación de leads. En la oferta pública empieza en Pro.
  leadScoring: boolean;
  // Sugerencias, resúmenes y el resto de llamadas de IA. Sin esto los créditos
  // son 0 (también los de bono).
  aiAccess: boolean;
  // Chat web (widget). Además de esto sigue detrás del flag de /plataforma.
  webchat: boolean;
  // Tope de usuarios (asientos) que admite el plan.
  maxSeats: number;
  // Embudos de la organización (no se multiplican por usuario).
  funnels: number;
  // Definiciones de campos de contacto, sumadas en todas las cuentas.
  customFields: number;
  // Agentes de IA (bots) configurados en la organización.
  aiAgents: number;
}

export interface Plan {
  id: PlanId;
  name: string;
  pricePerSeatMxn: number;
  tagline: string;
  // Etiqueta destacada en las tarjetas de precios (p. ej. "Más popular").
  badge: string | null;
  perSeat: PerSeatAllowances;
  perOrg: PerOrgAllowances;
}

// Tres planes de la oferta pública. Ids internos: ESSENTIAL (Básico),
// BUSINESS (Avanzado) y PRO. Empresarial no es un precio: se cotiza aparte.
export const PLANS: Record<PlanId, Plan> = {
  ESSENTIAL: {
    id: "ESSENTIAL",
    name: "Básico",
    pricePerSeatMxn: 59,
    tagline: "Para equipos pequeños que buscan funciones de IA básicas",
    badge: null,
    perSeat: {
      whatsapp: includedPlus(1),
      instagram: includedPlus(1),
      telegram: UNLIMITED_QUOTA,
      messenger: UNLIMITED_QUOTA,
      contacts: 12_500,
      activeLeads: 2_500,
      aiCreditsPerMonth: 750,
    },
    perOrg: {
      activeAutomations: 0,
      apiAccess: true,
      webhooks: false,
      campaigns: false,
      bots: false,
      leadScoring: false,
      aiAccess: true,
      webchat: true,
      maxSeats: 100,
      funnels: 50,
      customFields: 100,
      aiAgents: 0,
    },
  },
  BUSINESS: {
    id: "BUSINESS",
    name: "Avanzado",
    pricePerSeatMxn: 89,
    tagline: "Para equipos en desarrollo que buscan automatizar con IA",
    badge: null,
    perSeat: {
      whatsapp: includedPlus(3),
      instagram: includedPlus(3),
      telegram: UNLIMITED_QUOTA,
      messenger: UNLIMITED_QUOTA,
      contacts: 25_000,
      activeLeads: 5_000,
      aiCreditsPerMonth: 1_250,
    },
    perOrg: {
      activeAutomations: Infinity,
      apiAccess: true,
      webhooks: true,
      campaigns: true,
      bots: true,
      leadScoring: false,
      aiAccess: true,
      webchat: true,
      maxSeats: 100,
      funnels: 50,
      customFields: 200,
      aiAgents: 3,
    },
  },
  PRO: {
    id: "PRO",
    name: "Pro",
    pricePerSeatMxn: 149,
    tagline: "Para equipos consolidados que implementan IA avanzada",
    badge: "Más popular",
    perSeat: {
      whatsapp: UNLIMITED_QUOTA,
      instagram: UNLIMITED_QUOTA,
      telegram: UNLIMITED_QUOTA,
      messenger: UNLIMITED_QUOTA,
      contacts: 50_000,
      activeLeads: 10_000,
      aiCreditsPerMonth: 2_250,
    },
    perOrg: {
      activeAutomations: Infinity,
      apiAccess: true,
      webhooks: true,
      campaigns: true,
      bots: true,
      leadScoring: true,
      aiAccess: true,
      webchat: true,
      maxSeats: 100,
      funnels: 50,
      customFields: 400,
      aiAgents: 50,
    },
  },
};

export const PLAN_LIST: Plan[] = [PLANS.ESSENTIAL, PLANS.BUSINESS, PLANS.PRO];

// Canales que se limitan por ejecutivo, además de WhatsApp (el widget web no).
export const SEAT_CHANNELS = ["telegram", "messenger", "instagram"] as const;
export type SeatChannel = (typeof SEAT_CHANNELS)[number];
export const SEAT_CHANNEL_LABELS: Record<SeatChannel, string> = { telegram: "Telegram", messenger: "Messenger", instagram: "Instagram" };

// Límites efectivos de una organización con `seats` asientos.
export interface PlanLimits {
  seats: number; // usuarios activos + invitaciones pendientes
  whatsapp: number;
  telegram: number;
  messenger: number;
  instagram: number;
  contacts: number;
  activeLeads: number;
  aiCreditsPerMonth: number;
  activeAutomations: number;
  apiAccess: boolean;
  webhooks: boolean;
  campaigns: boolean;
  bots: boolean;
  leadScoring: boolean;
  aiAccess: boolean;
  webchat: boolean;
  funnels: number;
  customFields: number;
  aiAgents: number;
}

export function limitsForSeats(plan: Plan, seats: number): PlanLimits {
  const n = Math.min(plan.perOrg.maxSeats, Math.max(MIN_SEATS, Math.floor(seats)));
  const q = (quota: SeatQuota) => resolveQuota(quota, n);
  return {
    seats: n,
    whatsapp: q(plan.perSeat.whatsapp),
    telegram: q(plan.perSeat.telegram),
    messenger: q(plan.perSeat.messenger),
    instagram: q(plan.perSeat.instagram),
    contacts: plan.perSeat.contacts * n,
    activeLeads: plan.perSeat.activeLeads * n,
    aiCreditsPerMonth: plan.perSeat.aiCreditsPerMonth * n,
    activeAutomations: plan.perOrg.activeAutomations,
    apiAccess: plan.perOrg.apiAccess,
    webhooks: plan.perOrg.webhooks,
    campaigns: plan.perOrg.campaigns,
    bots: plan.perOrg.bots,
    leadScoring: plan.perOrg.leadScoring,
    aiAccess: plan.perOrg.aiAccess,
    webchat: plan.perOrg.webchat,
    funnels: plan.perOrg.funnels,
    customFields: plan.perOrg.customFields,
    aiAgents: plan.perOrg.aiAgents,
  };
}

export function monthlyTotalMxn(plan: Plan, seats: number): number {
  return plan.pricePerSeatMxn * Math.max(MIN_SEATS, Math.floor(seats));
}

// "$1,495" — siempre con PRICE_UNIT o "MXN al mes" al lado.
export function formatMxn(amount: number): string {
  return `$${amount.toLocaleString("es-MX")}`;
}

// "Avanzado: $89 MXN por usuario al mes" (+ la leyenda fiscal si existe).
export function priceSentence(plan: Plan): string {
  return `${plan.name}: ${formatMxn(plan.pricePerSeatMxn)} ${PRICE_UNIT}${PRICE_TAX_NOTE ? ` (${PRICE_TAX_NOTE})` : ""}`;
}

export const MIN_SEATS = 1;
// Tope de sensatez para Checkout / cambio de asientos desde la app (más que
// esto, por contacto).
export const MAX_SEATS = 100;

/** Tope de usuarios del plan (hoy MAX_SEATS en los tres). */
export function maxSeatsFor(plan: Plan): number {
  return Math.min(MAX_SEATS, plan.perOrg.maxSeats);
}

// Prueba gratis sin tarjeta, con el plan Pro y hasta TRIAL_MAX_SEATS usuarios.
// Los límites son los de Pro multiplicados por esos usuarios.
export const TRIAL_DAYS = 14;
export const TRIAL_PLAN: PlanId = "PRO";
export const TRIAL_MAX_SEATS = 3;
export const TRIAL_POOL_TEXT = "los límites de ese plan, incluidos contactos, leads activos y créditos de IA";
// Pago fallido: días de gracia antes de pasar a solo lectura. Solo para quien
// ya pagó (PAST_DUE); una prueba vencida pasa a solo lectura el día que vence.
export const GRACE_DAYS = 7;
// Organización cancelada: días antes de purgar sus datos.
export const RETENTION_DAYS_AFTER_CANCEL = 60;
// Prueba vencida sin haber pagado nunca: días en solo lectura antes de purgarla.
export const RETENTION_DAYS_AFTER_TRIAL = 60;

// ── IA incluida ──
// Modelos recomendados. El operador elige el de texto y el de imágenes en
// /plataforma; el cliente no elige. OpenCode es suscripción plana, así que
// cualquier modelo de ese catálogo vale. Gemini se reserva para notas de voz.
// `vision` marca candidatos cuando no hay una elección guardada.
export interface AiModelOption {
  id: string;
  provider: "opencode" | "google";
  label: string;
  description: string;
  vision: boolean;
}

export const AI_MODELS: AiModelOption[] = [
  { id: "glm-5.3-flash", provider: "opencode", label: "GLM 5.3 Flash", description: "Recomendado", vision: false },
  { id: "deepseek-v4.1-flash", provider: "opencode", label: "DeepSeek V4.1 Flash", description: "Alternativa para imágenes", vision: true },
  { id: "gemini-3.8-flash", provider: "google", label: "Gemini 3.8 Flash", description: "Solo para notas de voz. El resto lo atiende OpenCode", vision: true },
];

export const DEFAULT_AI_MODEL: Record<AiModelOption["provider"], string> = {
  opencode: "glm-5.3-flash",
  google: "gemini-3.8-flash",
};

export function isCuratedModel(provider: string, model: string): boolean {
  return AI_MODELS.some((m) => m.provider === provider && m.id === model);
}
