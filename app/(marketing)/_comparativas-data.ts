import type { PlanId } from "@prisma/client";
import { BRAND_CONTACT_EMAIL, BRAND_NAME } from "@/lib/brand";
import { appUrl } from "@/lib/app-url";
import { formatMxn, PLANS, TRIAL_DAYS } from "@/lib/billing/plans";
import { LICENSES } from "@/lib/billing/licenses";
import type { Guide } from "./_guides";

// Texto de las comparativas "plan por plan". Todo precio, suma o crédito de
// Colibly sale del catálogo (PLANS.pricePerSeatMxn, LICENSES, TRIAL_DAYS); los
// datos de Kommo, Leadsales y ManyChat van literales, con fecha y fuente
// (revisados el 9 de noviembre de 2026). Los precios de Colibly son precio
// final, sin IVA adicional. No usar PLANS[*].perSeat: es el catálogo anterior.
// Tipo de cambio de los montos en dólares: US$1 = $18.57 MXN (9 nov 2026).

export const COMPARATIVAS_REVIEWED = "2026-11-10";

const mxn = (n: number): string => `${formatMxn(n)} MXN`;
const num = (n: number): string => n.toLocaleString("es-MX");
const price = (id: PlanId): number => PLANS[id].pricePerSeatMxn;
/** "Colibly Avanzado" */
const lic = (id: PlanId): string => `${BRAND_NAME} ${PLANS[id].name}`;
/** Mensualidad de n personas con una licencia: "$267 MXN". */
const total = (id: PlanId, n: number): string => mxn(price(id) * n);

const B = "ESSENTIAL" as const;
const A = "BUSINESS" as const;
const P = "PRO" as const;

const DOCS_API = appUrl("/docs/api");
/** "app.colibly.com/docs/api" (sin esquema) para las tablas. */
const DOCS_API_SHORT = DOCS_API.replace(/^https?:\/\//, "");

/** Sección "API y webhooks de Colibly", igual en las tres comparativas. */
function apiSection(): Guide["sections"][number] {
  return {
    heading: `API y webhooks de ${BRAND_NAME}`,
    paragraphs: [
      `${lic(P)} (${mxn(price(P))} por usuario al mes) incluye una API REST y webhooks, con documentación pública en ${DOCS_API}. También vienen en la prueba gratuita. Con la API, tu sistema consulta y actualiza contactos, etiquetas y etapas del lead, lee conversaciones y cambia su estado o asignación, envía mensajes de WhatsApp (texto, plantillas y botones) y arranca automatizaciones. Los webhooks avisan a tu servidor cuando llega o sale un mensaje, se crea un contacto, cambia la etapa de un lead, se asigna o resuelve una conversación, se crea una cita o se califica un lead, entre otros eventos. Cada integración usa una API key con permisos por función, y cada webhook va firmado (HMAC-SHA256). La especificación está en OpenAPI 3.1 para importarla en Postman o generar clientes.`,
    ],
  };
}

const CSV_STEP =
  "Importa tus contactos desde un archivo CSV (lo puedes guardar desde Excel o Google Sheets). Antes de importar eliges qué es cada columna; caben hasta 5,000 filas por archivo.";

/** Fuentes de Kommo (revisadas el 9 nov 2026). */
const KOMMO_SOURCES = [
  { label: "Kommo, precios y tabla comparativa", url: "https://www.kommo.com/pricing/" },
  { label: "Kommo en español", url: "https://www.kommo.com/es/" },
];

export const KOMMO_GUIDE: Guide = {
  slug: "alternativa-a-kommo",
  section: "comparativas",
  title: "Colibly vs Kommo: planes y precios en México",
  h1: "Colibly vs Kommo: comparación plan por plan",
  description: `Colibly vs Kommo, plan por plan: Básico vs Base, Avanzado vs Advanced y Pro vs Pro. ${lic(B)}: ${mxn(price(B))} por usuario, mes a mes.`,
  intro: `Cada plan de ${BRAND_NAME} tiene su equivalente en Kommo: Básico con Base, Avanzado con Advanced y Pro con Pro. ${BRAND_NAME} cuesta de 5 a 8 veces menos por usuario: ${lic(B)} cuesta ${mxn(price(B))} y Kommo Base, US$25 (≈ $464 MXN). Además, ${BRAND_NAME} se paga mes a mes en pesos, mientras que Kommo cobra en dólares con un mínimo de 6 meses. A cambio, Kommo ofrece cupos más altos, más integraciones e IA desde su plan de entrada.`,
  sections: [
    {
      heading: "Plan equivalente, lado a lado",
      table: {
        headers: ["Nivel", BRAND_NAME, "Kommo", "Qué tienen en común"],
        rows: [
          ["Entrada", `Básico: ${mxn(price(B))} por usuario al mes`, "Base: US$25 por usuario al mes (≈ $464 MXN)", "Bandeja de chats, CRM con embudo, tareas, calendario y WhatsApp oficial, sin bots ni difusiones"],
          ["Automatización con IA", `Avanzado: ${mxn(price(A))} por usuario al mes`, "Advanced: US$35 por usuario al mes (≈ $650 MXN)", "Difusiones, bot o agente de IA, automatizaciones y encuesta de satisfacción"],
          ["Avanzado", `Pro: ${mxn(price(P))} por usuario al mes`, "Pro: US$45 por usuario al mes (≈ $836 MXN)", "Calificación de leads, conversiones de Meta Ads y la IA más completa de cada uno"],
        ],
      },
      notes: [`Los precios de ${BRAND_NAME} son precio final, sin IVA adicional.`],
    },
    {
      heading: "Qué incluye cada plan",
      table: {
        headers: ["Tema", `${lic(B)} / Kommo Base`, `${lic(A)} / Kommo Advanced`, `${lic(P)} / Kommo Pro`],
        rows: [
          [
            "Créditos de IA por usuario al mes",
            `${BRAND_NAME}: sin IA · Kommo: 750`,
            `${BRAND_NAME}: ${num(LICENSES[A].aiCreditsPerMonth)} · Kommo: 1,250`,
            `${BRAND_NAME}: ${num(LICENSES[P].aiCreditsPerMonth)} · Kommo: 2,250`,
          ],
          ["Bot / agente de IA", "Ninguno de los dos", `${BRAND_NAME}: sí · Kommo: hasta 3 agentes`, `${BRAND_NAME}: sí · Kommo: hasta 50 agentes`],
          ["Difusiones de WhatsApp", "Ninguno de los dos", "Los dos", "Los dos"],
          [
            "API y webhooks",
            `${lic(B)}: no · Kommo Base: API REST`,
            `${lic(A)}: no · Kommo Advanced: API REST y webhooks`,
            `Los dos (${lic(P)}: API REST v1 y webhooks firmados, documentados en ${DOCS_API_SHORT})`,
          ],
          ["Conversiones de Meta Ads", "Ninguno de los dos", "Ninguno de los dos", "Los dos"],
          [
            "Canales",
            `${BRAND_NAME}: 1 WhatsApp, 1 Instagram, 1 Messenger, 1 Telegram y 1 chat web por usuario · Kommo: 1 WhatsApp y 1 Instagram (+1 por usuario adicional), Facebook y Telegram ilimitados, chat web y email`,
            `${BRAND_NAME}: igual que Básico · Kommo: 3 WhatsApp y 3 Instagram`,
            `${BRAND_NAME}: igual que Básico · Kommo: ilimitados`,
          ],
          [
            "Leads activos / contactos por usuario",
            `${BRAND_NAME}: ${num(LICENSES[B].activeLeads)} / ${num(LICENSES[B].contacts)} · Kommo: 2,500 / 12,500`,
            `${BRAND_NAME}: ${num(LICENSES[A].activeLeads)} / ${num(LICENSES[A].contacts)} · Kommo: 5,000 / 25,000`,
            `${BRAND_NAME}: ${num(LICENSES[P].activeLeads)} / ${num(LICENSES[P].contacts)} · Kommo: 10,000 / 50,000`,
          ],
          [
            "Desde el celular",
            `${BRAND_NAME}: versión web móvil en el navegador, sin app instalable por ahora · Kommo: app para Android e iOS`,
            "Igual",
            "Igual",
          ],
        ],
      },
    },
    {
      heading: "Cuánto pagas según el tamaño de tu equipo",
      paragraphs: [
        `Precio mensual equivalente, con el tipo de cambio de $18.57 MXN por dólar (9 de noviembre de 2026). Los precios de ${BRAND_NAME} son finales, sin IVA adicional. Kommo se paga por adelantado al menos 6 meses. Ninguno incluye los cargos de Meta por mensajes de WhatsApp.`,
      ],
      table: {
        headers: ["Personas", lic(B), "Kommo Base", lic(A), "Kommo Advanced", lic(P), "Kommo Pro"],
        rows: [
          ["1", total(B, 1), "≈ $464 MXN", total(A, 1), "≈ $650 MXN", total(P, 1), "≈ $836 MXN"],
          ["3", total(B, 3), "≈ $1,393 MXN", total(A, 3), "≈ $1,950 MXN", total(P, 3), "≈ $2,507 MXN"],
          ["5", total(B, 5), "≈ $2,321 MXN", total(A, 5), "≈ $3,250 MXN", total(P, 5), "≈ $4,178 MXN"],
        ],
      },
      notes: [
        `Al contratar, con Kommo pagas 6 meses juntos. Para 3 personas son US$450 en Base (≈ $8,357 MXN) o US$630 en Advanced (≈ $11,699 MXN). Con ${BRAND_NAME} pagas solo el mes: ${lic(B)}, ${total(B, 3)}, o ${lic(A)}, ${total(A, 3)}. Además, en ${BRAND_NAME} cada persona puede tener una licencia distinta, por ejemplo dos Básico y un Pro. En Kommo todos van en el mismo plan.`,
      ],
    },
    {
      heading: "Lo que Kommo hace mejor",
      bullets: [
        "Cupos más altos de leads y contactos por usuario en cada plan.",
        `IA desde el plan de entrada: Kommo Base trae 750 créditos; ${lic(B)} no incluye IA.`,
        `API REST desde Base y webhooks desde Advanced. En ${BRAND_NAME}, la API y los webhooks (documentados en ${DOCS_API_SHORT}) son de la licencia Pro.`,
        "Más de 100 integraciones, página de reservas (Pro), Google Ads y Analytics (Pro) y canales como email y TikTok.",
        `Automatización de comentarios de Instagram (comentario a DM, desde Advanced). ${BRAND_NAME} todavía no automatiza comentarios de Instagram ni conecta TikTok.`,
        `App móvil para Android e iOS. ${BRAND_NAME} funciona desde el navegador del celular (versión web móvil), pero todavía no tiene app instalable.`,
      ],
    },
    apiSection(),
    {
      heading: `Cuándo elegir ${BRAND_NAME}`,
      bullets: [
        "Quieres el mismo tipo de herramienta por mucho menos y pagando en pesos.",
        "Prefieres pagar mes a mes, sin adelantar 6 meses.",
        `Tu equipo es mixto: unos solo atienden (${lic(B)}) y otros usan IA (${lic(A)} o Pro).`,
        "Quieres seguir usando WhatsApp en el celular gracias a la Coexistencia.",
      ],
    },
    {
      heading: "Cuándo elegir Kommo",
      bullets: [
        "Manejas muchos leads por vendedor o necesitas integraciones con otros sistemas desde el primer día.",
        "Quieres muchos agentes de IA o números de WhatsApp ilimitados.",
        "No te importa pagar en dólares ni comprometerte 6 meses.",
      ],
    },
    {
      heading: `Cómo cambiarte de Kommo a ${BRAND_NAME}`,
      bullets: [
        `Abre tu prueba de ${BRAND_NAME} (${TRIAL_DAYS} días con Pro, sin tarjeta) y sigue usando Kommo mientras configuras todo.`,
        CSV_STEP,
        "Conecta tu WhatsApp con la API oficial. Si tu número ya está conectado a la API con otro proveedor, pídele que lo libere antes.",
        "Recrea las etapas de tu embudo y carga en el bot la información de tu negocio.",
        "Revisa que tus plantillas de WhatsApp estén aprobadas.",
        `Pasa a tu equipo a la bandeja de ${BRAND_NAME} y cancela Kommo al final de su periodo pagado.`,
      ],
    },
  ],
  faq: [
    {
      q: `¿Qué plan de ${BRAND_NAME} equivale a cada plan de Kommo?`,
      a: `${lic(B)} equivale a Kommo Base, ${lic(A)} a Kommo Advanced y ${lic(P)} a Kommo Pro. Los emparejamos por funciones: el plan de entrada no tiene bots, el intermedio agrega IA y difusiones y el más alto suma calificación de leads y conversiones de Meta Ads.`,
    },
    {
      q: `¿Cuánto cuesta ${BRAND_NAME} comparado con Kommo para 3 personas?`,
      a: `${lic(B)} cuesta ${total(B, 3)} al mes y ${lic(A)}, ${total(A, 3)}. Kommo Base cuesta US$75 al mes (≈ $1,393 MXN) y Kommo Advanced, US$105 (≈ $1,950 MXN), pagando 6 meses por adelantado. Precios de Kommo revisados el 9 de noviembre de 2026.`,
    },
    {
      q: "¿Kommo cobra en pesos mexicanos?",
      a: `No. Kommo indica que solo factura en dólares, aunque algunos socios oficiales lo revenden en moneda local. ${BRAND_NAME} cobra en pesos mexicanos.`,
    },
    {
      q: `¿Kommo incluye algo que ${BRAND_NAME} no?`,
      a: `Sí. Kommo trae IA desde su plan Base, cupos más altos, API desde Base y más de 100 integraciones. ${BRAND_NAME} incluye bandeja, embudo, citas y WhatsApp oficial con Coexistencia desde ${lic(B)}, y bot de IA desde ${lic(A)}, por mucho menos.`,
    },
    {
      q: "¿Los mensajes de WhatsApp están incluidos?",
      a: `En ${BRAND_NAME} no: Meta cobra aparte algunos mensajes según su categoría y destino, y ese cargo se le paga directo a Meta. Lo explicamos en nuestra guía de precios de la API de WhatsApp.`,
    },
  ],
  related: ["alternativa-a-leadsales", "alternativa-a-manychat", "precio-whatsapp-business-api"],
  cta: `Prueba ${BRAND_NAME} ${TRIAL_DAYS} días con Pro, hasta 3 personas, sin tarjeta.`,
  sources: KOMMO_SOURCES,
  updated: COMPARATIVAS_REVIEWED,
};

// ───────────────────────── Leadsales ─────────────────────────

export const LEADSALES_GUIDE: Guide = {
  slug: "alternativa-a-leadsales",
  section: "comparativas",
  title: "Colibly vs Leadsales: planes y precios",
  h1: "Colibly vs Leadsales: comparación plan por plan",
  description: `Colibly vs Leadsales, plan por plan: qué incluye cada uno y cuánto pagas con 1, 3 o 5 personas. ${lic(B)}: ${mxn(price(B))} por usuario al mes.`,
  intro: `${lic(B)} equivale a Leadsales Básico, ${lic(A)} a Leadsales Profesional y ${lic(P)} a Leadsales Avanzado. La diferencia está en cómo cobran: ${BRAND_NAME} cobra por persona (${lic(B)}, ${mxn(price(B))} al mes), y Leadsales por cuenta, desde $2,362.92 MXN al mes con 3 usuarios. Por eso, para equipos de 1 a 5 personas, ${BRAND_NAME} es la opción más accesible. Además, ${BRAND_NAME} incluye la API oficial de WhatsApp desde Básico y el bot de IA dentro de la licencia Avanzado.`,
  sections: [
    {
      heading: "Plan equivalente, lado a lado",
      table: {
        headers: ["Nivel", BRAND_NAME, "Leadsales", "Qué tienen en común"],
        rows: [
          ["Entrada", `Básico: ${mxn(price(B))} por usuario al mes`, "Básico: $2,362.92 MXN al mes por cuenta (3 usuarios)", "CRM, bandeja y embudo, sin campañas ni IA"],
          ["Campañas e IA", `Avanzado: ${mxn(price(A))} por usuario al mes`, "Profesional: $3,239.88 MXN al mes por cuenta (4 usuarios)", "WhatsApp API oficial, campañas o difusiones y agente de IA"],
          [
            "El más completo",
            `Pro: ${mxn(price(P))} por usuario al mes`,
            "Avanzado: $6,016.92 MXN al mes por cuenta (5 usuarios)",
            `El nivel más alto de cada uno: Leadsales sube capacidad y ${BRAND_NAME} suma funciones (API, webhooks, Meta Ads, calificación de leads con IA, llamadas de WhatsApp)`,
          ],
        ],
      },
      notes: [`Los precios de ${BRAND_NAME} son precio final, sin IVA adicional.`],
    },
    {
      heading: "Qué incluye cada plan",
      table: {
        headers: ["Tema", `${lic(B)} / Leadsales Básico`, `${lic(A)} / Leadsales Profesional`, `${lic(P)} / Leadsales Avanzado`],
        rows: [
          ["WhatsApp API oficial", `${BRAND_NAME}: sí, con Coexistencia · Leadsales: no`, "Los dos", "Los dos"],
          ["Números de WhatsApp", `${BRAND_NAME}: 1 por usuario · Leadsales: 1 por cuenta`, "Igual", "Igual"],
          ["Campañas / difusiones", "Ninguno de los dos", "Los dos", "Los dos"],
          [
            "Agente de IA",
            "Ninguno de los dos",
            `${BRAND_NAME}: incluido, ${num(LICENSES[A].aiCreditsPerMonth)} créditos por usuario · Leadsales: Lead Agent gratis el 1.er mes, después desde US$87 (~$2,119.32 MXN) al mes`,
            `${BRAND_NAME}: incluido, ${num(LICENSES[P].aiCreditsPerMonth)} créditos por usuario · Leadsales: igual que Profesional`,
          ],
          [
            "Saldo para mensajes de WhatsApp",
            `${BRAND_NAME}: no incluido (se paga directo a Meta) · Leadsales: no aplica`,
            `${BRAND_NAME}: no incluido · Leadsales: US$10 ($245 MXN) al mes`,
            `${BRAND_NAME}: no incluido · Leadsales: US$20 ($490 MXN) al mes`,
          ],
          ["Otros canales", `${BRAND_NAME}: Instagram, Messenger, Telegram y chat web · Leadsales: Messenger e Instagram DM`, "Igual", "Igual"],
          [
            "Capacidad",
            `${BRAND_NAME}: ${num(LICENSES[B].activeLeads)} leads activos por usuario · Leadsales: 5,000 conversaciones activas por cuenta`,
            `${BRAND_NAME}: ${num(LICENSES[A].activeLeads)} por usuario · Leadsales: 20,000 por cuenta`,
            `${BRAND_NAME}: ${num(LICENSES[P].activeLeads)} por usuario · Leadsales: 50,000 por cuenta`,
          ],
          [
            "API y webhooks para tus sistemas",
            `${lic(B)}: no · Leadsales: no aparece en su página de precios`,
            `${lic(A)}: no · Leadsales: no aparece en su página de precios`,
            `${lic(P)}: API REST y webhooks documentados · Leadsales: no aparece en su página de precios`,
          ],
          ["Desde el celular", `${BRAND_NAME}: versión web móvil en el navegador, sin app instalable por ahora · Leadsales: app en App Store y Google Play`, "Igual", "Igual"],
        ],
      },
    },
    {
      heading: "Cuánto pagas según el tamaño de tu equipo",
      paragraphs: [
        `Precios en pesos tal como los publica leadsales.io/precios (pago mensual, 9 de noviembre de 2026). Leadsales cobra por cuenta e incluye 3, 4 o 5 usuarios según el plan; los usuarios adicionales tienen un costo que no publica. Los precios de ${BRAND_NAME} son finales, sin IVA adicional.`,
      ],
      table: {
        headers: ["Personas", lic(B), "Leadsales Básico", lic(A), "Leadsales Profesional", lic(P), "Leadsales Avanzado"],
        rows: [
          ["1", total(B, 1), "$2,362.92 MXN", total(A, 1), "$3,239.88 MXN", total(P, 1), "$6,016.92 MXN"],
          ["3", total(B, 3), "$2,362.92 MXN", total(A, 3), "$3,239.88 MXN", total(P, 3), "$6,016.92 MXN"],
          ["5", total(B, 5), "$2,362.92 MXN + 2 usuarios adicionales", total(A, 5), "$3,239.88 MXN + 1 usuario adicional", total(P, 5), "$6,016.92 MXN"],
        ],
      },
      notes: [
        `Si quieres el agente de IA de Leadsales después del primer mes, Profesional queda en desde $5,359.20 MXN al mes ($3,239.88 + $2,119.32). En ${lic(A)} el bot ya viene en la licencia: ${total(A, 3)} al mes para 3 personas. Leadsales da 10% a 20% de descuento si pagas 3, 6 o 12 meses por adelantado; ${BRAND_NAME} se paga mes a mes.`,
      ],
    },
    {
      heading: "Lo que Leadsales hace mejor",
      bullets: [
        "Incluye saldo para mensajes de WhatsApp cada mes en Profesional y Avanzado, y el saldo que no usas se acumula.",
        "Más capacidad por cuenta: hasta 50,000 conversaciones activas y 100 GB en Avanzado.",
        "Descuentos por pago trimestral, semestral o anual.",
        `App en App Store y Google Play. ${BRAND_NAME} funciona desde el navegador del celular (versión web móvil), pero todavía no tiene app instalable.`,
      ],
    },
    apiSection(),
    {
      heading: `Cuándo elegir ${BRAND_NAME}`,
      bullets: [
        "Son de 1 a 5 personas y quieren pagar solo por quien usa el sistema.",
        "Quieres la API oficial de WhatsApp desde el plan más barato.",
        "Quieres el bot de IA incluido, sin un cargo mensual aparte.",
        "Cada vendedor necesita su propio número de WhatsApp, o quieres atender también Telegram y el chat de tu web.",
      ],
    },
    {
      heading: "Cuándo elegir Leadsales",
      bullets: [
        "Mandas campañas masivas seguido y te conviene el saldo incluido.",
        "Tu equipo comparte una sola línea y maneja un volumen muy alto de conversaciones.",
        "Ya trabajas con Leadsales y tu equipo está contento.",
      ],
    },
    {
      heading: `Cómo cambiarte de Leadsales a ${BRAND_NAME}`,
      bullets: [
        `Abre tu prueba de ${BRAND_NAME} (${TRIAL_DAYS} días con Pro, sin tarjeta) sin cancelar Leadsales todavía.`,
        CSV_STEP,
        `Si tu número ya usa la API con Leadsales, pídeles que lo liberen para conectarlo en ${BRAND_NAME}. Si usas WhatsApp en el celular, ${BRAND_NAME} lo conecta con Coexistencia.`,
        "Arma tus etapas de embudo y carga en el bot tus respuestas frecuentes.",
        "Revisa que tus plantillas de WhatsApp sigan aprobadas.",
        "Leadsales indica que guarda tu espacio de trabajo 90 días después de cancelar, así que tienes tiempo para revisar tu historial.",
      ],
    },
  ],
  faq: [
    {
      q: `¿Qué plan de ${BRAND_NAME} equivale a cada plan de Leadsales?`,
      a: `${lic(B)} equivale a Leadsales Básico, ${lic(A)} a Leadsales Profesional y ${lic(P)} a Leadsales Avanzado. Los emparejamos por lo que incluyen: el plan de entrada no tiene campañas ni IA, el intermedio agrega WhatsApp API, campañas y agente de IA, y el más alto es el más completo de cada marca.`,
    },
    {
      q: `¿Cuánto cuesta ${BRAND_NAME} comparado con Leadsales para 3 personas?`,
      a: `${lic(B)} cuesta ${total(B, 3)} al mes y ${lic(A)}, ${total(A, 3)}. Leadsales Básico cuesta $2,362.92 MXN y Leadsales Profesional, $3,239.88 MXN al mes con pago mensual. Precios revisados el 9 de noviembre de 2026.`,
    },
    {
      q: "¿Leadsales incluye la API oficial de WhatsApp en todos sus planes?",
      a: `No. Solo en Profesional y Avanzado; su plan Básico no la incluye. En ${BRAND_NAME} todas las licencias, desde ${lic(B)}, usan la API oficial de Meta con Coexistencia.`,
    },
    {
      q: "¿El agente de IA tiene costo extra?",
      a: `En ${BRAND_NAME}, el bot de IA viene en las licencias Avanzado y Pro, con créditos mensuales por usuario. En Leadsales, Lead Agent es gratis el primer mes y después cuesta desde US$87 (~$2,119.32 MXN) al mes.`,
    },
    {
      q: "¿Los mensajes de WhatsApp tienen costo extra?",
      a: `En los dos casos, Meta cobra algunos mensajes según su categoría y país. En ${BRAND_NAME} ese cargo se le paga directo a Meta. Leadsales lo descuenta de un saldo que incluye su plan.`,
    },
  ],
  related: ["alternativa-a-kommo", "alternativa-a-manychat", "crm-whatsapp"],
  cta: `Prueba ${BRAND_NAME} ${TRIAL_DAYS} días con Pro, hasta 3 personas, sin tarjeta.`,
  sources: [{ label: "Leadsales, precios y preguntas frecuentes", url: "https://leadsales.io/precios/" }],
  updated: COMPARATIVAS_REVIEWED,
};

// ───────────────────────── ManyChat ─────────────────────────

export const MANYCHAT_GUIDE: Guide = {
  slug: "alternativa-a-manychat",
  section: "comparativas",
  title: "Alternativa a ManyChat para WhatsApp en México",
  h1: "Alternativa a ManyChat para WhatsApp: comparación plan por plan",
  description: `Alternativa a ManyChat para WhatsApp, plan por plan: qué incluye cada uno y cuánto pagas con 1, 3 o 5 personas. ${lic(B)}: ${mxn(price(B))} por usuario.`,
  intro: `${BRAND_NAME} es una alternativa a ManyChat para atender WhatsApp en equipo, y es más accesible en cada nivel. ${lic(B)} (${mxn(price(B))} por usuario) se compara con ManyChat Pro, el plan más barato de ManyChat que incluye WhatsApp (desde US$29 ≈ $539 MXN). ${lic(A)} (${mxn(price(A))} por usuario) se compara con ManyChat Business (desde US$69 ≈ $1,281 MXN), el primero de ManyChat con asignación automática de chats. ManyChat sigue siendo mejor para automatizar Instagram y TikTok, y muchos negocios usan los dos.`,
  sections: [
    {
      heading: "Plan equivalente, lado a lado",
      table: {
        headers: ["Nivel", BRAND_NAME, "ManyChat", "Qué tienen en común"],
        rows: [
          ["Atender WhatsApp", `Básico: ${mxn(price(B))} por usuario al mes`, "Pro: US$29/mes anual o US$39 mensual (≈ $539 a $724 MXN), 3 usuarios", "Es lo mínimo de cada uno para atender WhatsApp con bandeja"],
          ["Equipo con IA", `Avanzado: ${mxn(price(A))} por usuario al mes`, "Business: US$69/mes anual o US$99 mensual (≈ $1,281 a $1,838 MXN), 5 usuarios", "Bandeja de equipo con asignación automática, IA, difusiones y automatizaciones"],
          ["Integraciones", `Pro: ${mxn(price(P))} por usuario al mes`, "Business, o Advanced si son más de 5 personas (desde US$139/mes anual ≈ $2,581 MXN)", "API e integraciones para conectar otros sistemas"],
        ],
      },
      notes: [`Los precios de ${BRAND_NAME} son precio final, sin IVA adicional.`],
    },
    {
      heading: "Qué incluye cada plan",
      table: {
        headers: ["Tema", `${lic(B)} / ManyChat Pro`, `${lic(A)} / ManyChat Business`, `${lic(P)} / ManyChat Business`],
        rows: [
          ["WhatsApp", "Los dos (ManyChat: desde Pro)", "Los dos", "Los dos"],
          ["Asignación automática de chats", `${BRAND_NAME}: no · ManyChat Pro: no`, "Los dos", "Los dos"],
          ["IA", `${lic(B)}: no · ManyChat Pro: sí`, `Los dos (${BRAND_NAME}: ${num(LICENSES[A].aiCreditsPerMonth)} créditos por usuario)`, `Los dos (${BRAND_NAME}: ${num(LICENSES[P].aiCreditsPerMonth)} créditos por usuario)`],
          ["Difusiones de WhatsApp", `${lic(B)}: no · ManyChat Pro: sí`, "Los dos", "Los dos"],
          ["CRM con embudo de ventas y citas", `${BRAND_NAME}: sí · ManyChat: no aparece en su página de precios`, "Igual", "Igual"],
          [
            "API e integraciones",
            `${lic(B)}: no · ManyChat Pro: Zapier, Make, HubSpot, Stripe y acceso a API`,
            `${lic(A)}: no · ManyChat: igual que Pro`,
            `${lic(P)}: API REST y webhooks documentados, conversiones de Meta Ads · ManyChat: integraciones de Pro y acceso a API`,
          ],
          [
            "Canales",
            `${BRAND_NAME}: WhatsApp, Instagram, Messenger, Telegram y chat web por usuario · ManyChat Pro: 3 canales`,
            `${BRAND_NAME}: igual · ManyChat Business: ilimitados (incluye TikTok, SMS y email)`,
            "Igual",
          ],
          ["Desde el celular", `${BRAND_NAME}: versión web móvil en el navegador, sin app instalable por ahora · ManyChat: app móvil para la bandeja`, "Igual", "Igual"],
        ],
      },
    },
    {
      heading: "Cuánto pagas según el tamaño de tu equipo",
      paragraphs: [
        `ManyChat cobra por cuenta y cada persona que atiende chats ocupa un "asiento de bandeja": Pro incluye 2 y Business 3, y cada asiento extra cuesta US$25. Mostramos su precio con pago anual y mensual, convertido a $18.57 MXN por dólar (9 de noviembre de 2026). ManyChat aclara que sus precios no incluyen impuestos; los de ${BRAND_NAME} son precio final, sin IVA adicional.`,
      ],
      table: {
        headers: ["Personas", lic(B), "ManyChat Pro", lic(A), "ManyChat Business", lic(P)],
        rows: [
          ["1", total(B, 1), "≈ $539 MXN (anual) / ≈ $724 MXN (mensual)", total(A, 1), "≈ $1,281 / ≈ $1,838 MXN", total(P, 1)],
          ["3", total(B, 3), "≈ $1,003 / ≈ $1,188 MXN (con 1 asiento extra)", total(A, 3), "≈ $1,281 / ≈ $1,838 MXN", total(P, 3)],
          ["5", total(B, 5), "No disponible: Pro admite máximo 3 usuarios", total(A, 5), "≈ $2,210 / ≈ $2,767 MXN (con 2 asientos extra)", total(P, 5)],
        ],
      },
    },
    {
      heading: "Lo que ManyChat hace mejor",
      bullets: [
        `Automatizar comentarios, historias y mensajes de Instagram y TikTok es su especialidad. ${BRAND_NAME} atiende mensajes directos de Instagram en la bandeja, pero todavía no automatiza comentarios ni conecta TikTok.`,
        "Tiene un plan gratis (sin WhatsApp) y canales como SMS y email.",
        "Integraciones listas con Zapier, Make, HubSpot, Klaviyo y Stripe desde su plan Pro.",
        `Desde ManyChat Pro ya trae IA y difusiones; en ${BRAND_NAME} empiezan en la licencia Avanzado.`,
        `App móvil para atender la bandeja. ${BRAND_NAME} funciona desde el navegador del celular (versión web móvil), pero todavía no tiene app instalable.`,
      ],
    },
    apiSection(),
    {
      heading: `Cuándo elegir ${BRAND_NAME}`,
      bullets: [
        "WhatsApp es tu canal principal de venta y quieres que varias personas atiendan con orden y paguen poco.",
        "Necesitas embudo de ventas, tareas y citas junto al chat.",
        "Quieres pagar en pesos y por persona, mes a mes.",
      ],
    },
    {
      heading: "Cuándo quedarte con ManyChat (o usar ambos)",
      bullets: [
        "Tu crecimiento depende de flujos de Instagram o TikTok.",
        "Ya tienes automatizaciones complejas en ManyChat.",
        `Puedes usar ManyChat para captar en redes y ${BRAND_NAME} para atender WhatsApp con tu equipo.`,
      ],
    },
    {
      heading: "Cómo cambiar sin perder ventas",
      bullets: [
        `Deja ManyChat funcionando mientras conectas ${BRAND_NAME} en tu prueba de ${TRIAL_DAYS} días.`,
        CSV_STEP,
        `Si tu número de WhatsApp está conectado a la API con ManyChat, desconéctalo ahí antes de conectarlo en ${BRAND_NAME}. Puedes mantener ManyChat solo para Instagram.`,
        `Carga tus respuestas frecuentes en la información del bot de ${BRAND_NAME}.`,
        "Revisa que tus plantillas de WhatsApp sigan aprobadas.",
        `Pasa a tu equipo a la bandeja de ${BRAND_NAME} y apaga al final los flujos que se dupliquen.`,
      ],
    },
  ],
  faq: [
    {
      q: `¿Qué plan de ${BRAND_NAME} equivale a cada plan de ManyChat?`,
      a: `${lic(B)} se compara con ManyChat Pro, el plan más barato de ManyChat con WhatsApp. ${lic(A)} se compara con ManyChat Business, el primero con asignación automática de chats. ${lic(P)} se compara con ManyChat Business, o con Advanced si son más de 5 personas.`,
    },
    {
      q: `¿Cuánto cuesta ${BRAND_NAME} comparado con ManyChat para 3 personas?`,
      a: `${lic(B)} cuesta ${total(B, 3)} al mes y ${lic(A)}, ${total(A, 3)}. ManyChat Pro con 3 asientos de bandeja cuesta US$54 al mes con pago anual (≈ $1,003 MXN). ManyChat Business cuesta US$69 al mes con pago anual o US$99 mensual (≈ $1,281 a $1,838 MXN). Precios revisados el 9 de noviembre de 2026.`,
    },
    {
      q: "¿ManyChat incluye WhatsApp en el plan gratis?",
      a: "No. El plan Free y el Essential conectan Instagram, TikTok, Messenger o Telegram; WhatsApp está disponible desde el plan Pro.",
    },
    {
      q: "¿ManyChat cobra en pesos mexicanos?",
      a: `Su página muestra dólares y aclara que el precio depende del país de facturación y no incluye impuestos. Además, los mensajes de WhatsApp se cobran desde su Wallet en dólares. ${BRAND_NAME} cobra en pesos, con precio final sin IVA adicional, y los cargos de Meta se le pagan directo a Meta.`,
    },
    {
      q: `¿Puedo usar ${BRAND_NAME} y ManyChat al mismo tiempo?`,
      a: `Sí, siempre que cada número de WhatsApp esté conectado a un solo proveedor. Por ejemplo, ManyChat para Instagram y ${BRAND_NAME} para WhatsApp.`,
    },
  ],
  related: ["alternativa-a-kommo", "alternativa-a-leadsales", "chatbot-whatsapp-ia"],
  cta: `Prueba ${BRAND_NAME} ${TRIAL_DAYS} días con Pro, hasta 3 personas, sin tarjeta.`,
  sources: [
    { label: "ManyChat, precios y tabla comparativa completa", url: "https://manychat.com/pricing" },
    { label: "ManyChat, precios en español", url: "https://manychat.com/es/pricing" },
    { label: "ManyChat Help Center, guía de precios de WhatsApp", url: "https://help.manychat.com/en/articles/17742132-whatsapp-pricing-guide" },
    { label: "ManyChat Help Center, Credit Line", url: "https://help.manychat.com/en/articles/17741956-whatsapp-credit-line-troubleshooting" },
  ],
  updated: COMPARATIVAS_REVIEWED,
};

// ───────────────────────── Hub /comparativas ─────────────────────────

export const HUB = {
  title: "Comparativas de CRM para WhatsApp",
  description: `${BRAND_NAME} frente a Kommo, Leadsales y ManyChat, plan por plan: qué incluye cada uno y cuánto cuesta en pesos. Datos con fuente, revisados en nov. 2026.`,
  h1: `Comparativas: ${BRAND_NAME} frente a otros CRM de WhatsApp, plan por plan`,
  intro: `Comparamos cada plan de ${BRAND_NAME} con el plan equivalente de Kommo, Leadsales y ManyChat, emparejados por lo que incluyen y no por precio. En los tres casos ${BRAND_NAME} es la opción más accesible: cobra en pesos, por persona y mes a mes, desde ${lic(B)} a ${mxn(price(B))} por usuario, precio final sin IVA adicional. Te decimos también dónde la competencia ofrece más, para que decidas con datos.`,
  equivalence: {
    heading: "Plan equivalente",
    table: {
      headers: [BRAND_NAME, "Kommo", "Leadsales", "ManyChat"],
      rows: [
        [`Básico: ${mxn(price(B))} por usuario`, "Base: US$25 por usuario (≈ $464 MXN)", "Básico: $2,362.92 MXN por cuenta (3 usuarios)", "Pro: US$29 a US$39 por cuenta (≈ $539 a $724 MXN)"],
        [`Avanzado: ${mxn(price(A))} por usuario`, "Advanced: US$35 por usuario (≈ $650 MXN)", "Profesional: $3,239.88 MXN por cuenta (4 usuarios)", "Business: US$69 a US$99 por cuenta (≈ $1,281 a $1,838 MXN)"],
        [`Pro: ${mxn(price(P))} por usuario`, "Pro: US$45 por usuario (≈ $836 MXN)", "Avanzado: $6,016.92 MXN por cuenta (5 usuarios)", "Business o Advanced: desde US$69 por cuenta"],
      ],
    },
  },
  billing: {
    heading: "Cómo cobra cada uno",
    table: {
      headers: ["Herramienta", "Cómo cobra", "Moneda", "Prueba gratis"],
      rows: [
        [BRAND_NAME, "Por usuario, mes a mes; puedes mezclar licencias; precio final, sin IVA adicional", "MXN", `${TRIAL_DAYS} días con Pro, hasta 3 personas, sin tarjeta`],
        ["Kommo", "Por usuario; mínimo 6 meses; todos en el mismo plan", "USD", "14 días, sin tarjeta"],
        ["Leadsales", "Por cuenta, con 3 a 5 usuarios incluidos", "MXN o USD", "14 días"],
        ["ManyChat", "Por cuenta, según el plan y los contactos activos; sin impuestos incluidos", "USD", "14 días en Essential o Pro; plan Free sin WhatsApp"],
      ],
    },
  },
  listHeading: "Las comparativas",
  closing: `Los precios de la competencia cambian. Cada comparativa trae su fecha de revisión y enlaces a la fuente oficial. Si ves un dato desactualizado, escríbenos a ${BRAND_CONTACT_EMAIL} y lo corregimos.`,
  links: [
    { href: "/precios", label: "Planes y precios" },
    { href: "/", label: `Conocer ${BRAND_NAME}` },
    { href: "/guias", label: "Todas las guías" },
    { href: "/blog/mejores-crm-whatsapp-mexico", label: "Cómo elegir un CRM de WhatsApp en México" },
    { href: "/precio-whatsapp-business-api", label: "Cuánto cuesta la API de WhatsApp Business" },
  ],
  cta: `Prueba ${BRAND_NAME} ${TRIAL_DAYS} días, sin tarjeta.`,
};
