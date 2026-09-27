import type { PlanId } from "@prisma/client";

// Catálogo de planes — ÚNICO lugar para cambiar precios y límites. Lo leen la
// landing (precios), los candados del servidor (lib/billing/gates.ts), la
// pantalla "Plan y facturación" y el panel de plataforma. Sin dependencias de
// servidor: se importa también desde componentes cliente.

export interface PlanLimits {
  users: number;
  // Números de WhatsApp + cuentas de Telegram/Messenger/Instagram. El widget
  // web no cuenta: siempre incluido.
  channels: number;
  contacts: number;
  aiCreditsPerMonth: number;
  // Automatizaciones ACTIVAS a la vez (Infinity = sin límite).
  activeAutomations: number;
  apiAccess: boolean;
}

export interface Plan {
  id: PlanId;
  name: string;
  priceUsd: number;
  tagline: string;
  limits: PlanLimits;
}

export const PLANS: Record<PlanId, Plan> = {
  BASIC: {
    id: "BASIC",
    name: "Básico",
    priceUsd: 5,
    tagline: "Para empezar a vender por chat",
    limits: { users: 2, channels: 1, contacts: 1000, aiCreditsPerMonth: 300, activeAutomations: 5, apiAccess: false },
  },
  PRO: {
    id: "PRO",
    name: "Pro",
    priceUsd: 10,
    tagline: "Para equipos con varios canales",
    limits: { users: 5, channels: 3, contacts: 5000, aiCreditsPerMonth: 1000, activeAutomations: Infinity, apiAccess: true },
  },
};

export const PLAN_LIST: Plan[] = [PLANS.BASIC, PLANS.PRO];

// Prueba gratis sin tarjeta, con el plan Pro completo.
export const TRIAL_DAYS = 14;
export const TRIAL_PLAN: PlanId = "PRO";
// Pago fallido: días de gracia antes de pasar a solo lectura.
export const GRACE_DAYS = 7;
// Organización cancelada: días antes de purgar sus datos.
export const RETENTION_DAYS_AFTER_CANCEL = 60;
// Prueba vencida sin haber pagado nunca: días en solo lectura antes de purgarla.
export const RETENTION_DAYS_AFTER_TRIAL = 60;

// ── IA incluida ──
// Modelos que un cliente puede elegir para bots, calificadores y pasos de IA.
// Lista corta y económica a propósito: la IA la paga la plataforma, y con
// créditos por llamada (no por token) un modelo caro se comería el margen.
// `provider` debe tener su key de plataforma configurada para aparecer
// (lib/ai/platform.ts).
export interface AiModelOption {
  id: string;
  provider: "openrouter" | "google";
  label: string;
  description: string;
}

export const AI_MODELS: AiModelOption[] = [
  { id: "google/gemini-2.5-flash", provider: "openrouter", label: "Gemini 2.5 Flash", description: "Recomendado: rápido, entiende imágenes" },
  { id: "google/gemini-2.5-flash-lite", provider: "openrouter", label: "Gemini 2.5 Flash Lite", description: "El más rápido, para respuestas simples" },
  { id: "openai/gpt-4o-mini", provider: "openrouter", label: "GPT-4o mini", description: "Alternativa de OpenAI" },
  { id: "gemini-2.5-flash", provider: "google", label: "Gemini 2.5 Flash", description: "Recomendado: entiende imágenes y audios" },
  { id: "gemini-2.5-flash-lite", provider: "google", label: "Gemini 2.5 Flash Lite", description: "El más rápido, para respuestas simples" },
];

export const DEFAULT_AI_MODEL: Record<AiModelOption["provider"], string> = {
  openrouter: "google/gemini-2.5-flash",
  google: "gemini-2.5-flash",
};

export function isCuratedModel(provider: string, model: string): boolean {
  return AI_MODELS.some((m) => m.provider === provider && m.id === model);
}
