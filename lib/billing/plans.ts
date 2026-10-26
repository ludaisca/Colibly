import type { PlanId } from "@prisma/client";
export type { PlanId };

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
// organización); WhatsApp es 1 número por asiento (Coexistencia) y Telegram,
// Messenger e Instagram, 1 cuenta de cada tipo por asiento (2026-10-19).
// La prueba NO multiplica: bolsa plana de TRIAL_POOL para toda la organización.
// scripts/gen-cpanel-pricing.mjs copia estos números al sitio de cPanel; el
// test lib/billing/__tests__/cpanel-pricing.test.ts falla si divergen.

export const PRICE_CURRENCY = "MXN" as const;
export const PRICE_UNIT = "MXN por ejecutivo al mes";
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

// Por asiento (se multiplica por los asientos de la organización).
export interface PerSeatAllowances {
  whatsappNumbers: number;
  // Telegram, Messenger e Instagram (por habilitación del operador): cuentas
  // de CADA tipo por ejecutivo. El widget web no cuenta.
  channelsPerType: number;
  contacts: number;
  aiCreditsPerMonth: number;
}

// Por organización (no crecen con los asientos).
export interface PerOrgAllowances {
  // Automatizaciones ACTIVAS a la vez (Infinity = sin límite).
  activeAutomations: number;
  apiAccess: boolean;
  // Bots IA, calificadores de leads, recuperación y sugerencias. Sin IA los
  // créditos son 0 (también los de bono) y las pantallas muestran "mejora tu plan".
  aiAccess: boolean;
  // Chat web (widget). Además de esto sigue detrás del flag de /plataforma.
  webchat: boolean;
  // Tope de ejecutivos (asientos) que admite el plan.
  maxSeats: number;
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

// Tres planes (decisión del dueño, 2026-10-19). Ids internos: ESSENTIAL,
// BUSINESS (antes BASIC "Básico") y PRO.
export const PLANS: Record<PlanId, Plan> = {
  ESSENTIAL: {
    id: "ESSENTIAL",
    name: "Esencial",
    pricePerSeatMxn: 99,
    tagline: "Para equipos pequeños que atienden por WhatsApp",
    badge: null,
    perSeat: { whatsappNumbers: 1, channelsPerType: 0, contacts: 500, aiCreditsPerMonth: 0 },
    perOrg: { activeAutomations: 1, apiAccess: false, aiAccess: false, webchat: false, maxSeats: 3 },
  },
  BUSINESS: {
    id: "BUSINESS",
    name: "Negocio",
    pricePerSeatMxn: 199,
    tagline: "Para equipos que venden en todos sus canales con IA",
    badge: null,
    perSeat: { whatsappNumbers: 1, channelsPerType: 1, contacts: 2000, aiCreditsPerMonth: 300 },
    perOrg: { activeAutomations: 5, apiAccess: false, aiAccess: true, webchat: true, maxSeats: 100 },
  },
  PRO: {
    id: "PRO",
    name: "Pro",
    pricePerSeatMxn: 349,
    tagline: "Para equipos que automatizan e integran",
    badge: "Más popular",
    perSeat: { whatsappNumbers: 1, channelsPerType: 1, contacts: 5000, aiCreditsPerMonth: 1000 },
    perOrg: { activeAutomations: Infinity, apiAccess: true, aiAccess: true, webchat: true, maxSeats: 100 },
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
  whatsapp: number; // números de WhatsApp conectados
  // Cuentas de cada tipo (1 por ejecutivo de cada uno).
  telegram: number;
  messenger: number;
  instagram: number;
  contacts: number;
  aiCreditsPerMonth: number;
  activeAutomations: number;
  apiAccess: boolean;
  aiAccess: boolean;
  webchat: boolean;
}

// `trial`: la bolsa de contactos y créditos es la plana de TRIAL_POOL (no
// se multiplica por asientos); números y canales siguen siendo por asiento.
export function limitsForSeats(plan: Plan, seats: number, opts: { trial?: boolean } = {}): PlanLimits {
  const n = Math.min(plan.perOrg.maxSeats, Math.max(MIN_SEATS, Math.floor(seats)));
  const perType = plan.perSeat.channelsPerType * n;
  return {
    seats: n,
    whatsapp: plan.perSeat.whatsappNumbers * n,
    telegram: perType,
    messenger: perType,
    instagram: perType,
    contacts: opts.trial ? TRIAL_POOL.contacts : plan.perSeat.contacts * n,
    aiCreditsPerMonth: opts.trial ? TRIAL_POOL.aiCreditsPerMonth : plan.perSeat.aiCreditsPerMonth * n,
    activeAutomations: plan.perOrg.activeAutomations,
    apiAccess: plan.perOrg.apiAccess,
    aiAccess: plan.perOrg.aiAccess,
    webchat: plan.perOrg.webchat,
  };
}

export function monthlyTotalMxn(plan: Plan, seats: number): number {
  return plan.pricePerSeatMxn * Math.max(MIN_SEATS, Math.floor(seats));
}

// "$1,495" — siempre con PRICE_UNIT o "MXN al mes" al lado.
export function formatMxn(amount: number): string {
  return `$${amount.toLocaleString("es-MX")}`;
}

// "Negocio: $199 MXN por ejecutivo al mes" (+ la leyenda fiscal si existe).
export function priceSentence(plan: Plan): string {
  return `${plan.name}: ${formatMxn(plan.pricePerSeatMxn)} ${PRICE_UNIT}${PRICE_TAX_NOTE ? ` (${PRICE_TAX_NOTE})` : ""}`;
}

export const MIN_SEATS = 1;
// Tope de sensatez para Checkout / cambio de asientos desde la app (más que
// esto, por contacto).
export const MAX_SEATS = 100;

/** Tope de ejecutivos del plan (Esencial: 3; los demás, MAX_SEATS). */
export function maxSeatsFor(plan: Plan): number {
  return Math.min(MAX_SEATS, plan.perOrg.maxSeats);
}

// Prueba gratis sin tarjeta, con el plan Pro completo y hasta TRIAL_MAX_SEATS
// ejecutivos (números de WhatsApp y canales se calculan con ese número).
// Contactos y créditos de IA NO se multiplican en la prueba: TRIAL_POOL es la
// bolsa plana de toda la organización (decisión del dueño, 2026-10-19).
export const TRIAL_DAYS = 14;
export const TRIAL_PLAN: PlanId = "PRO";
export const TRIAL_MAX_SEATS = 3;
export const TRIAL_POOL = { contacts: 5000, aiCreditsPerMonth: 1000 } as const;
// "5,000 contactos y 1,000 créditos de IA al mes para todo el equipo" — para la copia.
export const TRIAL_POOL_TEXT = `${TRIAL_POOL.contacts.toLocaleString("es-MX")} contactos y ${TRIAL_POOL.aiCreditsPerMonth.toLocaleString("es-MX")} créditos de IA al mes para todo el equipo`;
// Pago fallido: días de gracia antes de pasar a solo lectura. Solo para quien
// ya pagó (PAST_DUE); una prueba vencida pasa a solo lectura el día que vence.
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
