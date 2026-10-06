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
  // Pipelines de ventas NO archivados a la vez (cada uno con sus etapas).
  pipelines: number;
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
    limits: { users: 2, channels: 1, contacts: 1000, aiCreditsPerMonth: 300, activeAutomations: 5, pipelines: 1, apiAccess: false },
  },
  PRO: {
    id: "PRO",
    name: "Pro",
    priceUsd: 10,
    tagline: "Para equipos con varios canales",
    limits: { users: 5, channels: 3, contacts: 5000, aiCreditsPerMonth: 1000, activeAutomations: Infinity, pipelines: 5, apiAccess: true },
  },
};

export const PLAN_LIST: Plan[] = [PLANS.BASIC, PLANS.PRO];

// Prueba gratis sin tarjeta, con el plan Pro completo.
export const TRIAL_DAYS = 30;
export const TRIAL_PLAN: PlanId = "PRO";
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
