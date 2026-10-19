import type { PlanId } from "@prisma/client";

// Catálogo de planes — ÚNICO lugar para cambiar precios y límites. Lo leen la
// landing (precios), los candados del servidor (lib/billing/gates.ts), la
// pantalla "Plan y facturación", el panel de plataforma y el generador del
// sitio de cPanel. Sin dependencias de servidor ni imports de valores (solo
// `import type`): se importa desde componentes cliente y desde Node directo
// (scripts/gen-cpanel-pricing.mjs, con type stripping).

// ── Precio por asiento (decisión del dueño, 2026-10-19) ──
// Se cobra por EJECUTIVO: cada usuario de la organización que puede atender
// conversaciones (dueño y admins incluidos) ocupa un asiento, y las
// invitaciones pendientes también. Mensual, en pesos mexicanos, sin plan anual.
// Los límites de contactos y créditos de IA se suman por asiento (bolsa de la
// organización); WhatsApp es 1 número por asiento (Coexistencia).
// scripts/gen-cpanel-pricing.mjs copia estos números al sitio de cPanel; el
// test lib/billing/__tests__/cpanel-pricing.test.ts falla si divergen.

export const PRICE_CURRENCY = "MXN" as const;
export const PRICE_UNIT = "MXN por ejecutivo al mes";
// Leyenda fiscal junto a cada precio público. null = no se muestra ninguna:
// hoy no se factura, así que la copia NO dice "incluye IVA" ni "verás el precio
// final con impuestos". Si eso cambia, se escribe aquí (p. ej. "más IVA") y
// aparece en la landing, /precios, /beta, términos, cPanel y la pantalla del
// plan a la vez.
export const PRICE_TAX_NOTE: string | null = null;

// Por asiento (se multiplica por los asientos de la organización).
export interface PerSeatAllowances {
  whatsappNumbers: number;
  contacts: number;
  aiCreditsPerMonth: number;
}

// Por organización (no crecen con los asientos).
export interface PerOrgAllowances {
  // Automatizaciones ACTIVAS a la vez (Infinity = sin límite).
  activeAutomations: number;
  // Telegram/Messenger/Instagram (por habilitación del operador). El widget web
  // no cuenta. Es el tope que antes compartían con WhatsApp; WhatsApp ahora va
  // por asiento.
  otherChannels: number;
  apiAccess: boolean;
}

export interface Plan {
  id: PlanId;
  name: string;
  pricePerSeatMxn: number;
  tagline: string;
  perSeat: PerSeatAllowances;
  perOrg: PerOrgAllowances;
}

export const PLANS: Record<PlanId, Plan> = {
  BASIC: {
    id: "BASIC",
    name: "Básico",
    pricePerSeatMxn: 149,
    tagline: "Para equipos que empiezan a vender por WhatsApp",
    perSeat: { whatsappNumbers: 1, contacts: 1000, aiCreditsPerMonth: 300 },
    perOrg: { activeAutomations: 5, otherChannels: 1, apiAccess: false },
  },
  PRO: {
    id: "PRO",
    name: "Pro",
    pricePerSeatMxn: 299,
    tagline: "Para equipos que automatizan e integran",
    perSeat: { whatsappNumbers: 1, contacts: 5000, aiCreditsPerMonth: 1000 },
    perOrg: { activeAutomations: Infinity, otherChannels: 3, apiAccess: true },
  },
};

export const PLAN_LIST: Plan[] = [PLANS.BASIC, PLANS.PRO];

// Límites efectivos de una organización con `seats` asientos.
export interface PlanLimits {
  seats: number; // usuarios activos + invitaciones pendientes
  whatsapp: number; // números de WhatsApp conectados
  channels: number; // Telegram/Messenger/Instagram (sin el widget web)
  contacts: number;
  aiCreditsPerMonth: number;
  activeAutomations: number;
  apiAccess: boolean;
}

export function limitsForSeats(plan: Plan, seats: number): PlanLimits {
  const n = Math.max(MIN_SEATS, Math.floor(seats));
  return {
    seats: n,
    whatsapp: plan.perSeat.whatsappNumbers * n,
    channels: plan.perOrg.otherChannels,
    contacts: plan.perSeat.contacts * n,
    aiCreditsPerMonth: plan.perSeat.aiCreditsPerMonth * n,
    activeAutomations: plan.perOrg.activeAutomations,
    apiAccess: plan.perOrg.apiAccess,
  };
}

export function monthlyTotalMxn(plan: Plan, seats: number): number {
  return plan.pricePerSeatMxn * Math.max(MIN_SEATS, Math.floor(seats));
}

// "$1,495" — siempre con PRICE_UNIT o "MXN al mes" al lado.
export function formatMxn(amount: number): string {
  return `$${amount.toLocaleString("es-MX")}`;
}

// "Básico: $149 MXN por ejecutivo al mes" (+ la leyenda fiscal si existe).
export function priceSentence(plan: Plan): string {
  return `${plan.name}: ${formatMxn(plan.pricePerSeatMxn)} ${PRICE_UNIT}${PRICE_TAX_NOTE ? ` (${PRICE_TAX_NOTE})` : ""}`;
}

export const MIN_SEATS = 1;
// Tope de sensatez para Checkout / cambio de asientos desde la app (más que
// esto, por contacto).
export const MAX_SEATS = 200;

// Prueba gratis sin tarjeta, con el plan Pro completo y hasta TRIAL_MAX_SEATS
// ejecutivos (los límites por asiento se calculan con ese número).
export const TRIAL_DAYS = 30;
export const TRIAL_PLAN: PlanId = "PRO";
export const TRIAL_MAX_SEATS = 3;
// Pago fallido: días de gracia antes de pasar a solo lectura.
export const GRACE_DAYS = 7;
// Organización cancelada: días antes de purgar sus datos.
export const RETENTION_DAYS_AFTER_CANCEL = 60;
// Prueba vencida sin haber pagado nunca: días en solo lectura antes de purgarla.
export const RETENTION_DAYS_AFTER_TRIAL = 60;

// ── IA incluida ──
// Modelos curados que la plataforma asigna sola a bots/calificadores/pasos de
// IA (nunca elegidos por el cliente, ver lib/ai/platform.ts:pickCuratedModel())
// — lista corta y económica a propósito: la IA la paga la plataforma, y con
// créditos por llamada (no por token) un modelo caro se comería el margen.
// `provider` debe tener su key de plataforma configurada para aparecer
// (lib/ai/platform.ts). `vision` decide qué modelos son candidatos para un bot
// que puede recibir imágenes (WhatsApp/Telegram) — un calificador (solo texto)
// no lo necesita.
export interface AiModelOption {
  id: string;
  provider: "opencode" | "google";
  label: string;
  description: string;
  vision: boolean;
}

export const AI_MODELS: AiModelOption[] = [
  { id: "opencode-go/glm-5.3-flash", provider: "opencode", label: "GLM 5.3 Flash", description: "Recomendado: rápido y barato", vision: false },
  { id: "opencode-go/deepseek-v4-flash-vision-exp", provider: "opencode", label: "DeepSeek V4 Flash Vision", description: "Con visión, para WhatsApp multimodal", vision: true },
  { id: "gemini-3.8-flash", provider: "google", label: "Gemini 3.8 Flash", description: "Recomendado: entiende imágenes y audios", vision: true },
];

export const DEFAULT_AI_MODEL: Record<AiModelOption["provider"], string> = {
  opencode: "opencode-go/glm-5.3-flash",
  google: "gemini-3.8-flash",
};

export function isCuratedModel(provider: string, model: string): boolean {
  return AI_MODELS.some((m) => m.provider === provider && m.id === model);
}
