import type { Plan } from "./plans";

// Lo que incluye cada plan, en texto para la landing, /precios, la pantalla
// del plan y el sitio de cPanel (scripts/gen-cpanel-pricing.mjs). Sale de
// plans.ts: cambiar un número cambia todas las copias. Solo `import type`
// (ver la nota de plans.ts).

export const COEXISTENCE_PITCH = "Cada ejecutivo conecta su propio WhatsApp y lo sigue usando en su celular (Coexistencia).";

export const META_FEES_NOTE =
  "Meta cobra aparte algunos mensajes de WhatsApp según su categoría y destino; ese cargo lo paga el cliente directamente a Meta y no forma parte de la suscripción.";

export function planFeatures(plan: Plan): Array<{ text: string; included: boolean }> {
  const s = plan.perSeat;
  const o = plan.perOrg;
  const n = (v: number) => v.toLocaleString("es-MX");
  const otherChannels = s.channelsPerType > 0;
  return [
    { text: `${s.whatsappNumbers} número de WhatsApp por ejecutivo, con Coexistencia`, included: true },
    { text: `${n(s.contacts)} contactos por ejecutivo`, included: true },
    o.aiAccess
      ? { text: `${n(s.aiCreditsPerMonth)} créditos de IA al mes por ejecutivo`, included: true }
      : { text: "Bots y asistentes de IA", included: false },
    {
      text: Number.isFinite(o.activeAutomations)
        ? `${o.activeAutomations} ${o.activeAutomations === 1 ? "automatización activa" : "automatizaciones activas"}`
        : "Automatizaciones ilimitadas",
      included: true,
    },
    otherChannels
      ? { text: `${s.channelsPerType} cuenta de Telegram, de Messenger y de Instagram por ejecutivo, por habilitación`, included: true }
      : { text: "Telegram, Messenger e Instagram", included: false },
    o.webchat ? { text: "Chat web disponible por habilitación", included: true } : { text: "Chat web", included: false },
    { text: "Integración con tus sistemas vía API o webhooks", included: o.apiAccess },
    ...(o.maxSeats < 100 ? [{ text: `Hasta ${o.maxSeats} ejecutivos`, included: true }] : []),
  ];
}

// Nota pública junto a los precios: moneda (sin afirmar nada de IVA, ver
// PRICE_CURRENCY_NOTE en plans.ts) y cargos de Meta aparte.
export const PRICING_FOOTNOTE = "Precios en MXN, por ejecutivo al mes. Los cargos de Meta por mensajes de WhatsApp se pagan aparte, directamente a Meta.";
