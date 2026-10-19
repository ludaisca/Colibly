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
  return [
    { text: `${s.whatsappNumbers} número de WhatsApp por ejecutivo, con Coexistencia`, included: true },
    { text: `${n(s.contacts)} contactos por ejecutivo`, included: true },
    { text: `${n(s.aiCreditsPerMonth)} créditos de IA al mes por ejecutivo`, included: true },
    { text: Number.isFinite(o.activeAutomations) ? `${o.activeAutomations} automatizaciones activas` : "Automatizaciones ilimitadas", included: true },
    { text: `${s.channelsPerType} cuenta de Telegram, de Messenger y de Instagram por ejecutivo, por habilitación`, included: true },
    { text: "Chat web disponible por habilitación", included: true },
    { text: "API y webhooks", included: o.apiAccess },
  ];
}
