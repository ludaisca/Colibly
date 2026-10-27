// Oferta pública de la landing y de /precios. Los precios y los topes numéricos
// salen de lib/billing/plans.ts (Básico / Avanzado / Pro). Esta matriz describe
// las funciones; una fila solo puede decir «sí» cuando el producto ya la tiene.

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

export const OFFER_FROM_MXN = 59;

export const LANDING_PLANS: LandingPlan[] = [
  {
    id: "base",
    name: "Básico",
    tagline: "Para equipos pequeños que buscan funciones de IA básicas",
    priceMxn: 59,
    leads: "2,500 leads por usuario",
    credits: "750 créditos de IA por usuario al mes",
    channels: "1 número de WhatsApp y 1 cuenta de Instagram. Cada usuario adicional desbloquea 1 canal.",
    includes: [
      "Múltiples embudos con etapas editables",
      "Bandeja unificada",
      "Calendario y tareas",
      "Respuestas sugeridas, resúmenes y asistencia de escritura con IA",
    ],
  },
  {
    id: "advanced",
    name: "Avanzado",
    tagline: "Para equipos en desarrollo que buscan automatizar con IA",
    priceMxn: 89,
    leads: "5,000 leads por usuario",
    credits: "1,250 créditos de IA por usuario al mes",
    channels: "3 números de WhatsApp y 3 cuentas de Instagram. Después, 1 canal más por cada usuario extra.",
    includes: [
      "Todo en Básico",
      "Automatizaciones, difusiones y bots sin código",
      "Hasta 3 agentes de IA",
      "200 campos personalizados y webhooks",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "Para equipos consolidados que implementan IA avanzada",
    priceMxn: 149,
    leads: "10,000 leads por usuario",
    credits: "2,250 créditos de IA por usuario al mes",
    channels: "Números de WhatsApp ilimitados y cuentas de Instagram ilimitadas.",
    includes: [
      "Todo en Avanzado",
      "Hasta 50 agentes de IA y calificación de leads",
      "400 campos personalizados",
    ],
    featured: true,
  },
  {
    id: "enterprise",
    name: "Empresarial",
    tagline: "CRM personalizado con IA, seguridad y soporte premium",
    priceMxn: null,
    leads: "Leads y contactos a la medida",
    credits: "Créditos de IA a la medida",
    channels: "Canales ilimitados, más allá de los límites estándar.",
    includes: [
      "Todo en Pro, con límites a la medida",
      "Seguridad y soporte que se cotizan aparte",
    ],
  },
];

type Row = { kind: "row"; label: string; cells: [OfferCell, OfferCell, OfferCell, OfferCell] };
type Sub = { kind: "sub"; label: string };
export type OfferGroup = { title: string; items: Array<Row | Sub> };

const y = true;
const n = false;
function r(label: string, base: OfferCell, advanced: OfferCell, pro: OfferCell, enterprise: OfferCell): Row {
  return { kind: "row", label, cells: [base, advanced, pro, enterprise] };
}
function sub(label: string): Sub {
  return { kind: "sub", label };
}

const wa1 = "1 incluido +1 número por usuario adicional";
const wa3 = "3 incluidos +1 número por usuario adicional";
const ig1 = "1 incluida +1 cuenta por usuario adicional";
const ig3 = "3 incluidas +1 cuenta por usuario adicional";
const inf = "Ilimitado";
const custom = "A la medida";

/** Comparación pública: solo filas que el producto ya hace. */
export const OFFER_GROUPS: OfferGroup[] = [
  {
    title: "Canales",
    items: [
      r("Bandeja unificada", y, y, y, y),
      r("WhatsApp oficial, con Coexistencia", y, y, y, y),
      r("Números de WhatsApp", wa1, wa3, inf, inf),
      r("Cuentas de Instagram", ig1, ig3, inf, inf),
      r("Cuentas de Telegram", inf, inf, inf, inf),
      r("Cuentas de Facebook Messenger", inf, inf, inf, inf),
      r("Chat web", y, y, y, y),
      r("Plantillas y botones de WhatsApp", y, y, y, y),
      r("Difusiones de WhatsApp", n, y, y, y),
    ],
  },
  {
    title: "Embudo y trabajo",
    items: [
      r("Embudos", "50", "50", "50", custom),
      r("Etapas editables", y, y, y, y),
      r("Leads activos por usuario", "2,500", "5,000", "10,000", custom),
      r("Contactos por usuario", "12,500", "25,000", "50,000", custom),
      r("Campos personalizados", "100", "200", "400", custom),
      r("Tareas por contacto", y, y, y, y),
      r("Calendario y citas", y, y, y, y),
      r("Ganados y perdidos (30 días)", y, y, y, y),
    ],
  },
  {
    title: "IA y automatización",
    items: [
      r("Créditos de IA al mes por usuario", "750", "1,250", "2,250", custom),
      sub("Asistencia"),
      r("Respuestas sugeridas", y, y, y, y),
      r("Resúmenes", y, y, y, y),
      r("Asistencia de escritura", y, y, y, y),
      r("Sugerencia de tareas", y, y, y, y),
      sub("Agentes"),
      r("Agentes de IA", n, "3", "50", custom),
      r("Automatizaciones", n, y, y, y),
      r("Calificación de leads", n, n, y, y),
    ],
  },
  {
    title: "Integraciones",
    items: [
      r("Google Sheets", y, y, y, y),
      r("Formularios de leads de Meta", y, y, y, y),
      r("API", y, y, y, y),
      r("Webhooks", n, y, y, y),
    ],
  },
];
