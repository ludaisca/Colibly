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
