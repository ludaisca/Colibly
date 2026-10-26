import type { Plan, PlanId } from "./plans";
import { PLAN_LIST } from "./plans";

// Lo que incluye cada plan, en texto para la landing, /precios, la pantalla
// del plan y el sitio de cPanel (scripts/gen-cpanel-pricing.mjs). Sale de
// plans.ts: cambiar un número cambia todas las copias. Solo `import type`
// de Prisma vía plans; PLAN_LIST es valor puro (sin Node).

export const COEXISTENCE_PITCH = "Cada ejecutivo conecta su propio WhatsApp y lo sigue usando en su celular (Coexistencia).";

export const META_FEES_NOTE =
  "Meta cobra aparte algunos mensajes de WhatsApp según su categoría y destino; ese cargo lo paga el cliente directamente a Meta y no forma parte de la suscripción.";

export type PlanFeature = { text: string; included: boolean; hint?: string };

export function planFeatures(plan: Plan): PlanFeature[] {
  const s = plan.perSeat;
  const o = plan.perOrg;
  const n = (v: number) => v.toLocaleString("es-MX");
  const otherChannels = s.channelsPerType > 0;
  return [
    {
      text: `${s.whatsappNumbers} número de WhatsApp por ejecutivo, con Coexistencia`,
      included: true,
      hint: "El mismo número sigue en el celular (WhatsApp Business) y en Colibly a la vez.",
    },
    { text: `${n(s.contacts)} contactos por ejecutivo`, included: true },
    o.aiAccess
      ? {
          text: `${n(s.aiCreditsPerMonth)} créditos de IA al mes por ejecutivo`,
          included: true,
          hint: "1 crédito ≈ 1 respuesta de bot, sugerencia, calificación o paso de IA en una automatización. Se suman en una bolsa del equipo.",
        }
      : {
          text: "Bots y asistentes de IA",
          included: false,
          hint: "Disponible desde Negocio: bots, sugerencias y calificación de leads.",
        },
    {
      text: Number.isFinite(o.activeAutomations)
        ? `${o.activeAutomations} ${o.activeAutomations === 1 ? "automatización activa" : "automatizaciones activas"}`
        : "Automatizaciones ilimitadas",
      included: true,
      hint: "Flujos con botones, seguimiento y pasos de IA publicados a la vez.",
    },
    otherChannels
      ? {
          text: `${s.channelsPerType} cuenta de Telegram, de Messenger y de Instagram por ejecutivo, por habilitación`,
          included: true,
          hint: "Los activa el operador de Colibly en tu organización cuando los necesites.",
        }
      : {
          text: "Telegram, Messenger e Instagram",
          included: false,
          hint: "Incluidos en Negocio y Pro, por habilitación.",
        },
    o.webchat
      ? {
          text: "Chat web disponible por habilitación",
          included: true,
          hint: "Widget para tu sitio; también lo activa el operador cuando lo pidas.",
        }
      : { text: "Chat web", included: false, hint: "Incluido en Negocio y Pro." },
    {
      text: "Integración con tus sistemas vía API o webhooks",
      included: o.apiAccess,
      hint: o.apiAccess
        ? "API pública y webhooks salientes para conectar tu stack."
        : "Disponible en el plan Pro.",
    },
    ...(o.maxSeats < 100
      ? [{ text: `Hasta ${o.maxSeats} ejecutivos`, included: true, hint: "Tope del plan Esencial." }]
      : []),
  ];
}

/** Celda de la matriz pública de planes (`/precios`). */
export type PlanCompareCell = boolean | string;

export interface PlanCompareRow {
  id: string;
  label: string;
  hint?: string;
  values: Record<PlanId, PlanCompareCell>;
}

function fmtNum(v: number): string {
  return v.toLocaleString("es-MX");
}

/** Filas de comparación derivadas de PLAN_LIST — una sola fuente con las cards. */
export function planCompareRows(): PlanCompareRow[] {
  const byId = Object.fromEntries(PLAN_LIST.map((p) => [p.id, p])) as Record<PlanId, Plan>;
  const cell = (pick: (p: Plan) => PlanCompareCell): Record<PlanId, PlanCompareCell> => ({
    ESSENTIAL: pick(byId.ESSENTIAL),
    BUSINESS: pick(byId.BUSINESS),
    PRO: pick(byId.PRO),
  });

  return [
    {
      id: "whatsapp",
      label: "WhatsApp por ejecutivo",
      hint: "Con Coexistencia: el número sigue en el celular",
      values: cell((p) => `${p.perSeat.whatsappNumbers}`),
    },
    {
      id: "contacts",
      label: "Contactos por ejecutivo",
      values: cell((p) => fmtNum(p.perSeat.contacts)),
    },
    {
      id: "ai",
      label: "Créditos de IA / mes por ejecutivo",
      hint: "1 crédito ≈ 1 respuesta de bot, sugerencia o calificación",
      values: cell((p) => (p.perOrg.aiAccess ? fmtNum(p.perSeat.aiCreditsPerMonth) : false)),
    },
    {
      id: "automations",
      label: "Automatizaciones activas",
      values: cell((p) =>
        Number.isFinite(p.perOrg.activeAutomations) ? String(p.perOrg.activeAutomations) : "Ilimitadas"
      ),
    },
    {
      id: "channels",
      label: "Telegram, Messenger e Instagram",
      hint: "1 cuenta de cada tipo por ejecutivo, por habilitación",
      values: cell((p) => (p.perSeat.channelsPerType > 0 ? `${p.perSeat.channelsPerType} de cada uno` : false)),
    },
    {
      id: "webchat",
      label: "Chat web",
      values: cell((p) => p.perOrg.webchat),
    },
    {
      id: "api",
      label: "API y webhooks",
      values: cell((p) => p.perOrg.apiAccess),
    },
    {
      id: "seats",
      label: "Máximo de ejecutivos",
      values: cell((p) => fmtNum(p.perOrg.maxSeats)),
    },
  ];
}

// Nota pública junto a los precios: moneda (sin afirmar nada de IVA, ver
// PRICE_CURRENCY_NOTE en plans.ts) y cargos de Meta aparte.
export const PRICING_FOOTNOTE = "Precios en MXN, por ejecutivo al mes. Los cargos de Meta por mensajes de WhatsApp se pagan aparte, directamente a Meta.";
