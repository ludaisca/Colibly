// Oferta pública de la landing y de /precios: licencias por usuario
// (docs/PLAN_LICENCIAS_2026-11-04.md). Precios de lib/billing/plans.ts; cupos y
// funciones de lib/billing/licenses.ts — la misma fuente que cobra la app y
// que deciden los candados, así que la página no puede prometer otra cosa.

import type { PlanId } from "@prisma/client";
import {
  hasFeature,
  LICENSE_FEATURE_NAMES,
  LICENSES,
  licenseAddedFeatures,
  type LicenseFeature,
} from "@/lib/billing/licenses";
import { PLANS } from "@/lib/billing/plans";

export type OfferCell = true | false | string;

export type LandingPlan = {
  id: "base" | "advanced" | "pro" | "enterprise";
  name: string;
  tagline: string;
  /** null = a la medida. MXN por usuario al mes. */
  priceMxn: number | null;
  leads: string;
  credits: string;
  channels: string;
  includes: string[];
  featured?: boolean;
};

export const OFFER_FROM_MXN = PLANS.ESSENTIAL.pricePerSeatMxn;

/** Cada licencia: un canal de cada tipo. */
export const CHANNELS_PER_USER_LINE = "1 WhatsApp (con Coexistencia), 1 Instagram, 1 Messenger, 1 Telegram y 1 chat web por usuario";

const n = (v: number) => v.toLocaleString("es-MX");
const funnelsText = (id: PlanId) => (Number.isFinite(LICENSES[id].funnels) ? `${n(LICENSES[id].funnels)} ${LICENSES[id].funnels === 1 ? "embudo" : "embudos"}` : "Embudos sin tope");

function licensePlan(id: PlanId, key: LandingPlan["id"], tagline: string, base: string[]): LandingPlan {
  const t = LICENSES[id];
  return {
    id: key,
    name: PLANS[id].name,
    tagline,
    priceMxn: PLANS[id].pricePerSeatMxn,
    leads: `${n(t.activeLeads)} leads activos y ${n(t.contacts)} contactos por usuario`,
    credits: t.aiCreditsPerMonth > 0 ? `${n(t.aiCreditsPerMonth)} créditos de IA por usuario al mes` : "Sin créditos de IA",
    channels: CHANNELS_PER_USER_LINE,
    includes: [...base, ...licenseAddedFeatures(id).map((f) => LICENSE_FEATURE_NAMES[f]), `${funnelsText(id)} y ${n(t.customFields)} campos personalizados`],
    featured: id === "BUSINESS",
  };
}

export const LANDING_PLANS: LandingPlan[] = [
  licensePlan("ESSENTIAL", "base", "Para atender a tus clientes desde una bandeja, con CRM y embudo de ventas", [
    "Bandeja unificada",
    "CRM, embudo de ventas y tareas",
    "Calendario y citas",
    "Respuestas rápidas",
  ]),
  licensePlan("BUSINESS", "advanced", "Para automatizar con IA: bots, difusiones y automatizaciones", ["Todo en Básico, más:"]),
  licensePlan("PRO", "pro", "Para equipos que integran IA avanzada, API y Meta Ads", ["Todo en Avanzado, más:"]),
  {
    id: "enterprise",
    name: "Empresarial",
    tagline: "CRM personalizado con IA, seguridad y soporte premium",
    priceMxn: null,
    leads: "Leads y contactos a la medida",
    credits: "Créditos de IA a la medida",
    channels: "Canales y licencias a la medida.",
    includes: ["Todo en Pro, con límites a la medida", "Seguridad y soporte que se cotizan aparte"],
  },
];

type Row = { kind: "row"; label: string; cells: [OfferCell, OfferCell, OfferCell, OfferCell] };
type Sub = { kind: "sub"; label: string };
export type OfferGroup = { title: string; items: Array<Row | Sub> };

const y = true;
const custom = "A la medida";
function r(label: string, base: OfferCell, advanced: OfferCell, pro: OfferCell, enterprise: OfferCell): Row {
  return { kind: "row", label, cells: [base, advanced, pro, enterprise] };
}
function sub(label: string): Sub {
  return { kind: "sub", label };
}
/** Fila de una función de licencia: sí/no por plan, y Empresarial siempre. */
function f(label: string, feature: LicenseFeature): Row {
  return r(label, hasFeature("ESSENTIAL", feature), hasFeature("BUSINESS", feature), hasFeature("PRO", feature), y);
}
/** Fila numérica por licencia. */
function num(label: string, pick: (id: PlanId) => string): Row {
  return r(label, pick("ESSENTIAL"), pick("BUSINESS"), pick("PRO"), custom);
}

/** Comparación pública: solo filas que el producto ya hace. */
export const OFFER_GROUPS: OfferGroup[] = [
  {
    title: "Canales",
    items: [
      r("Bandeja unificada", y, y, y, y),
      r("WhatsApp oficial, con Coexistencia", y, y, y, y),
      r("Canales por usuario", "1 de cada tipo", "1 de cada tipo", "1 de cada tipo", custom),
      r("Instagram, Messenger, Telegram y chat web", y, y, y, y),
      r("Plantillas y botones de WhatsApp", y, y, y, y),
      f("Difusiones de WhatsApp", "campaigns"),
      f("Llamadas de WhatsApp", "calls"),
    ],
  },
  {
    title: "Embudo y trabajo",
    items: [
      num("Embudos (por organización)", (id) => (Number.isFinite(LICENSES[id].funnels) ? n(LICENSES[id].funnels) : "Sin tope")),
      r("Etapas editables", y, y, y, y),
      num("Leads activos por usuario", (id) => n(LICENSES[id].activeLeads)),
      num("Contactos por usuario", (id) => n(LICENSES[id].contacts)),
      num("Campos personalizados (por organización)", (id) => n(LICENSES[id].customFields)),
      r("Tareas, calendario y citas", y, y, y, y),
      r("Respuestas rápidas", y, y, y, y),
      f("Macros", "macros"),
      f("Asignación automática", "autoAssign"),
      f("Encuestas de satisfacción (CSAT)", "csat"),
    ],
  },
  {
    title: "IA y automatización",
    items: [
      r("Créditos de IA al mes por usuario", false, n(LICENSES.BUSINESS.aiCreditsPerMonth), n(LICENSES.PRO.aiCreditsPerMonth), custom),
      sub("Asistente"),
      f("Respuestas sugeridas y resúmenes", "aiAssist"),
      f("Reescritura y transcripción de notas de voz", "aiAssist"),
      sub("Agentes y automatización"),
      f("Agente de IA (bot) en tus canales", "aiAgent"),
      f("Automatizaciones y secuencias", "automations"),
      f("Calificación de leads", "leadScoring"),
      f("Monitores de temas", "topicMonitors"),
      f("Recuperación de leads", "leadRecovery"),
    ],
  },
  {
    title: "Integraciones",
    items: [
      f("Google Sheets y fuentes de leads", "leadSources"),
      f("Formularios y conversiones de Meta Ads", "metaAds"),
      f("API", "api"),
      f("Webhooks", "webhooks"),
    ],
  },
];
