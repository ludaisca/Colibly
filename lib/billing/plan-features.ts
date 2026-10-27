import type { Plan, PlanId, SeatQuota } from "./plans";
import { PLAN_LIST } from "./plans";

// Lo que incluye cada plan, en texto para la landing, /precios, la pantalla
// del plan y el sitio de cPanel (scripts/gen-cpanel-pricing.mjs). Sale de
// plans.ts: cambiar un número cambia todas las copias. Solo `import type`
// de Prisma vía plans; PLAN_LIST es valor puro (sin Node).

export const COEXISTENCE_PITCH = "Cada ejecutivo conecta su propio WhatsApp y lo sigue usando en su celular (Coexistencia).";

export const META_FEES_NOTE =
  "Meta cobra aparte algunos mensajes de WhatsApp según su categoría y destino; ese cargo lo paga el cliente directamente a Meta y no forma parte de la suscripción.";

export type PlanFeature = { text: string; included: boolean; hint?: string };

function quotaLine(quota: SeatQuota, one: string, many: string, feminine = false): { text: string; included: boolean } {
  if (quota.kind === "none") return { text: many, included: false };
  if (quota.kind === "unlimited") return { text: `${many} sin tope`, included: true };
  if (quota.kind === "perSeat") {
    const n = quota.each;
    return { text: `${n.toLocaleString("es-MX")} ${n === 1 ? one : many} por usuario`, included: true };
  }
  const n = quota.included;
  const adj = n === 1 ? (feminine ? "incluida" : "incluido") : feminine ? "incluidas" : "incluidos";
  return {
    text: `${n.toLocaleString("es-MX")} ${n === 1 ? one : many} ${adj} y 1 más por cada usuario adicional`,
    included: true,
  };
}

export function planFeatures(plan: Plan): PlanFeature[] {
  const s = plan.perSeat;
  const o = plan.perOrg;
  const n = (v: number) => v.toLocaleString("es-MX");
  const wa = quotaLine(s.whatsapp, "número de WhatsApp", "números de WhatsApp");
    const ig = quotaLine(s.instagram, "cuenta de Instagram", "cuentas de Instagram", true);
  return [
    { text: `${wa.text}, con Coexistencia`, included: wa.included, hint: "El mismo número sigue en el celular (WhatsApp Business) y en Colibly a la vez." },
    { text: ig.text, included: ig.included },
    { text: "Telegram, Messenger y chat web", included: o.webchat },
    { text: `${n(s.contacts)} contactos por usuario`, included: true },
    { text: `${n(s.activeLeads)} leads activos por usuario`, included: true, hint: "Contactos que todavía no están en Cliente ni Perdido." },
    o.aiAccess
      ? {
          text: `${n(s.aiCreditsPerMonth)} créditos de IA al mes por usuario`,
          included: true,
          hint: "1 crédito ≈ 1 respuesta de bot, sugerencia, calificación o paso de IA. Se suman en una bolsa del equipo.",
        }
      : { text: "Créditos de IA", included: false },
    {
      text: o.activeAutomations === 0 ? "Automatizaciones" : Number.isFinite(o.activeAutomations) ? `${o.activeAutomations} automatizaciones activas` : "Automatizaciones sin tope",
      included: o.activeAutomations !== 0,
    },
    { text: "Bots que responden solos", included: o.bots, hint: o.bots ? "Un bot activo por cuenta." : "Disponible desde Avanzado. En Básico quedan las sugerencias y los resúmenes." },
    { text: "Difusiones de WhatsApp", included: o.campaigns },
    { text: "Calificación de leads", included: o.leadScoring, hint: o.leadScoring ? undefined : "Disponible en Pro." },
    { text: "API", included: o.apiAccess },
    { text: "Webhooks", included: o.webhooks, hint: o.webhooks ? undefined : "Disponibles desde Avanzado." },
    { text: `${n(o.funnels)} embudos`, included: true, hint: "Cada uno con sus etapas." },
    { text: `${n(o.customFields)} campos personalizados`, included: true },
    {
      text: o.aiAgents === 0 ? "Agentes de IA" : `Hasta ${n(o.aiAgents)} agentes de IA`,
      included: o.aiAgents > 0,
      hint: o.aiAgents === 0 ? "Disponibles desde Avanzado. En Básico quedan sugerencias, resúmenes y reescritura." : "Un agente activo por cuenta.",
    },
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
      label: "WhatsApp",
      hint: "Con Coexistencia: el número sigue en el celular",
      values: cell((p) => quotaLine(p.perSeat.whatsapp, "número", "números").text),
    },
    {
      id: "instagram",
      label: "Instagram",
      values: cell((p) => quotaLine(p.perSeat.instagram, "cuenta", "cuentas", true).text),
    },
    {
      id: "contacts",
      label: "Contactos por usuario",
      values: cell((p) => fmtNum(p.perSeat.contacts)),
    },
    {
      id: "leads",
      label: "Leads activos por usuario",
      values: cell((p) => fmtNum(p.perSeat.activeLeads)),
    },
    {
      id: "ai",
      label: "Créditos de IA / mes por usuario",
      hint: "1 crédito ≈ 1 respuesta de bot, sugerencia o calificación",
      values: cell((p) => (p.perOrg.aiAccess ? fmtNum(p.perSeat.aiCreditsPerMonth) : false)),
    },
    {
      id: "automations",
      label: "Automatizaciones activas",
      values: cell((p) =>
        p.perOrg.activeAutomations === 0 ? false : Number.isFinite(p.perOrg.activeAutomations) ? String(p.perOrg.activeAutomations) : "Sin tope"
      ),
    },
    {
      id: "bots",
      label: "Bots que responden solos",
      values: cell((p) => p.perOrg.bots),
    },
    {
      id: "scoring",
      label: "Calificación de leads",
      values: cell((p) => p.perOrg.leadScoring),
    },
    {
      id: "campaigns",
      label: "Difusiones de WhatsApp",
      values: cell((p) => p.perOrg.campaigns),
    },
    {
      id: "webchat",
      label: "Chat web",
      values: cell((p) => p.perOrg.webchat),
    },
    {
      id: "api",
      label: "API",
      values: cell((p) => p.perOrg.apiAccess),
    },
    {
      id: "webhooks",
      label: "Webhooks",
      values: cell((p) => p.perOrg.webhooks),
    },
    {
      id: "seats",
      label: "Máximo de usuarios",
      values: cell((p) => fmtNum(p.perOrg.maxSeats)),
    },
  ];
}

// Nota pública junto a los precios: moneda (sin afirmar nada de IVA, ver
// PRICE_CURRENCY_NOTE en plans.ts) y cargos de Meta aparte.
export const PRICING_FOOTNOTE = "Precios en MXN, por usuario al mes. Los cargos de Meta por mensajes de WhatsApp se pagan aparte, directamente a Meta.";
