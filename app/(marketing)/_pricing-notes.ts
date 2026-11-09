import { LICENSES } from "@/lib/billing/licenses";

// Reglas de las licencias que se muestran en /precios. Viven aquí para que la
// página y /llms-full.txt lean el mismo texto.

const num = (v: number) => v.toLocaleString("es-MX");
const { ESSENTIAL: B, BUSINESS: A, PRO: P } = LICENSES;

// Reglas de las licencias (docs/PLAN_LICENCIAS_2026-11-04.md); números del catálogo.
export const NOTES = [
  "Cada persona de tu equipo, incluidos el dueño y los administradores, paga una licencia, y en un mismo equipo puedes mezclar Básico, Avanzado y Pro. Agregas o quitas licencias cuando quieras; el pago es mensual.",
  "Cada licencia incluye un canal de cada tipo: un WhatsApp (con Coexistencia), un Instagram, un Messenger, un Telegram y un chat web. Cada canal funciona con la licencia de su dueño: por ejemplo, el bot solo responde en los canales de una persona con Avanzado o Pro.",
  `Contactos y leads activos se suman en tu equipo: Básico aporta ${num(B.contacts)} contactos y ${num(B.activeLeads)} leads; Avanzado, ${num(A.contacts)} y ${num(A.activeLeads)}; Pro, ${num(P.contacts)} y ${num(P.activeLeads)}. Embudos y campos personalizados son los de la licencia más alta del equipo.`,
  `Los créditos de IA son de cada persona: ${num(A.aiCreditsPerMonth)} al mes con Avanzado y ${num(P.aiCreditsPerMonth)} con Pro; Básico no incluye IA. Lo automático en un chat (bot, automatizaciones) usa los créditos del dueño del canal. Los que no usas no pasan al mes siguiente.`,
  "La API, los webhooks y las conversiones de Meta Ads los configura un administrador con licencia Pro.",
];
