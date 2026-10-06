import type { Plan } from "./plans";

// Lo que incluye cada plan, en texto para la landing y la pantalla del plan
// (sale de los límites de plans.ts: cambiar un límite cambia ambas).
export function planFeatures(plan: Plan): Array<{ text: string; included: boolean }> {
  const l = plan.limits;
  const n = (v: number) => (Number.isFinite(v) ? v.toLocaleString("es-MX") : "Ilimitadas");
  return [
    { text: `${l.users} usuarios`, included: true },
    { text: l.channels === 1 ? "1 canal (WhatsApp; otros por habilitación)" : `${l.channels} canales (adicionales por habilitación)`, included: true },
    { text: "Chat web disponible por habilitación", included: true },
    { text: `${n(l.contacts)} contactos`, included: true },
    { text: `${n(l.aiCreditsPerMonth)} créditos de IA al mes`, included: true },
    { text: Number.isFinite(l.activeAutomations) ? `${l.activeAutomations} automatizaciones activas` : "Automatizaciones ilimitadas", included: true },
    { text: l.pipelines === 1 ? "1 pipeline de ventas" : `${n(l.pipelines)} pipelines de ventas`, included: true },
    { text: "Tareas, línea de tiempo, Mi día y reportes de ventas", included: true },
    { text: "API y webhooks", included: l.apiAccess },
  ];
}
