import { BRAND_NAME } from "@/lib/brand";
import { TRIAL_DAYS } from "@/lib/billing/plans";
import { COEXISTENCE_PITCH, META_FEES_NOTE } from "@/lib/billing/plan-features";
import { OFFER_FROM_MXN } from "./_landing-offer-data";

// Guías públicas pensadas para búsquedas concretas (SEO) y para que los
// asistentes de IA tengan respuestas claras que citar (GEO). Solo se afirma lo
// que el producto hace hoy; precios y pruebas salen del catálogo.
// Cada guía es una ruta (page.tsx) que renderiza <GuidePage guide={…} />.

export type Guide = {
  slug: string;
  /** Título de la pestaña (sin la marca: el layout la agrega). */
  title: string;
  /** <h1> de la página. */
  h1: string;
  description: string;
  intro: string;
  sections: { heading: string; paragraphs?: string[]; bullets?: string[] }[];
  faq: { q: string; a: string }[];
  related: string[];
};

export const GUIDES: Guide[] = [
  {
    slug: "crm-whatsapp",
    title: "CRM para WhatsApp en México",
    h1: "CRM para WhatsApp: vende y da seguimiento desde el chat",
    description: `${BRAND_NAME} es un CRM para WhatsApp hecho en México: bandeja compartida, embudo de ventas, citas, automatizaciones y bot de IA. Desde $${OFFER_FROM_MXN} MXN por usuario al mes, ${TRIAL_DAYS} días gratis.`,
    intro: `Un CRM para WhatsApp junta en un solo lugar las conversaciones con tus clientes y todo lo que sigue después: quién es cada contacto, en qué etapa de la venta va, qué cita tiene y quién del equipo le contesta. ${BRAND_NAME} está hecho para negocios de México que venden por chat.`,
    sections: [
      {
        heading: "Qué resuelve un CRM para WhatsApp",
        paragraphs: [
          "Cuando el negocio crece, el WhatsApp del celular se vuelve un desorden: mensajes sin responder, clientes que nadie recuerda y ventas que se enfrían. Un CRM conectado a WhatsApp guarda cada conversación como parte de la ficha del contacto, para que cualquiera del equipo pueda retomarla.",
        ],
        bullets: [
          "Una bandeja compartida: todo el equipo ve y atiende los mismos chats.",
          "Asignación de chats a una persona o a un equipo, con tiempos de respuesta.",
          "Ficha de cada contacto con su historial, etiquetas y campos propios.",
          "Embudo de ventas y tareas para no perder el seguimiento.",
          "Citas en calendario.",
        ],
      },
      {
        heading: `Qué incluye ${BRAND_NAME}`,
        bullets: [
          "WhatsApp con la API oficial de Meta, y también Instagram, Messenger, Telegram y chat web en la misma bandeja.",
          "Bot de IA que contesta con lo que sabe tu negocio (precios, servicios, preguntas frecuentes) y pasa el chat a una persona cuando hace falta.",
          "Automatizaciones, respuestas rápidas y difusiones de WhatsApp con plantillas aprobadas.",
          "Reportes de atención y de ventas.",
          "API y webhooks para conectarlo con otros sistemas.",
        ],
      },
      {
        heading: "Cuánto cuesta",
        paragraphs: [
          `Pagas una licencia por persona al mes, en pesos: Básico, Avanzado o Pro, y puedes mezclarlas en el mismo equipo. Arrancan desde $${OFFER_FROM_MXN} MXN por usuario. La prueba dura ${TRIAL_DAYS} días con todas las funciones, sin tarjeta. ${META_FEES_NOTE}`,
        ],
      },
    ],
    faq: [
      { q: "¿Qué es un CRM para WhatsApp?", a: "Es un sistema que conecta tu WhatsApp con la gestión de clientes: guarda las conversaciones en la ficha de cada contacto, reparte los chats entre tu equipo y da seguimiento a las ventas y citas." },
      { q: "¿Necesito la API oficial de WhatsApp?", a: `Sí. ${BRAND_NAME} se conecta con la API oficial de WhatsApp Business de Meta y te guía en la conexión. ${COEXISTENCE_PITCH}` },
      { q: "¿Sirve si soy una sola persona?", a: "Sí. Con una licencia atiendes tus chats, llevas tus contactos y puedes dejar que el bot conteste cuando estés ocupado." },
      { q: "¿Cuánto cuesta?", a: `Desde $${OFFER_FROM_MXN} MXN por usuario al mes. Los primeros ${TRIAL_DAYS} días son gratis, sin tarjeta.` },
    ],
    related: ["chatbot-whatsapp-ia", "whatsapp-business-app-vs-api", "precio-whatsapp-business-api"],
  },
  {
    slug: "chatbot-whatsapp-ia",
    title: "Chatbot de IA para WhatsApp",
    h1: "Chatbot de IA para WhatsApp que responde con lo que sabe tu negocio",
    description: `Bot de IA para WhatsApp que contesta con la información de tu negocio y pasa el chat a una persona cuando hace falta. Incluido en ${BRAND_NAME}, ${TRIAL_DAYS} días gratis.`,
    intro: `Un chatbot de IA para WhatsApp contesta a tus clientes a cualquier hora usando la información que le das: precios, servicios, horarios y preguntas frecuentes. En ${BRAND_NAME} el bot trabaja dentro de la misma bandeja que tu equipo, así que puedes tomar el chat en cualquier momento.`,
    sections: [
      {
        heading: "Cómo funciona el bot",
        bullets: [
          "Le enseñas tu negocio: subes documentos o escribes la información, y el bot responde con base en ella.",
          "Contesta mensajes de texto y también notas de voz, que transcribe para entenderlas.",
          "Si una persona de tu equipo responde en el chat, el bot se pausa para no interrumpirla.",
          "Responde con un pequeño retraso natural, no en el mismo instante, para que la conversación se sienta humana.",
        ],
      },
      {
        heading: "Qué no hace",
        paragraphs: [
          "El bot se limita a lo que sabe de tu negocio. Lo que no sabe, lo deja para tu equipo en lugar de inventarlo. Tú decides en qué canales y con qué instrucciones responde, y puedes apagarlo cuando quieras.",
        ],
      },
      {
        heading: "Créditos de IA",
        paragraphs: [
          "Cada respuesta del bot, sugerencia o calificación usa un crédito de IA. Los créditos son de cada persona según su licencia (Avanzado o Pro), y se renuevan cada mes. El bot trabaja con los créditos del dueño del canal donde conversa.",
        ],
      },
    ],
    faq: [
      { q: "¿El bot puede contestar notas de voz?", a: "Sí. Las transcribe y responde sobre el texto." },
      { q: "¿Qué pasa si el bot no sabe la respuesta?", a: "No inventa: deja el chat para una persona de tu equipo, que lo ve en la bandeja." },
      { q: "¿Puedo tomar el chat cuando quiera?", a: "Sí. En cuanto alguien del equipo responde, el bot se pausa en ese chat." },
      { q: "¿Qué licencia necesito?", a: `El bot que responde solo viene con las licencias Avanzado y Pro. Puedes probarlo ${TRIAL_DAYS} días sin tarjeta.` },
    ],
    related: ["crm-whatsapp", "whatsapp-business-api-coexistencia"],
  },
  {
    slug: "whatsapp-business-api-coexistencia",
    title: "WhatsApp Business API con Coexistencia",
    h1: "WhatsApp Business API con Coexistencia: usa tu número en el celular y en el CRM",
    description: `Conecta tu número a la API oficial de WhatsApp Business sin dejar de usar la app en el celular (Coexistencia). Te guiamos paso a paso con ${BRAND_NAME}.`,
    intro: `Antes, pasar un número a la API de WhatsApp Business obligaba a dejar de usarlo en la app del celular. Con la Coexistencia de Meta puedes tener el mismo número en la API y en tu celular. ${BRAND_NAME} te ayuda a conectarlo.`,
    sections: [
      {
        heading: "Qué es la Coexistencia",
        paragraphs: [
          "Es una modalidad de Meta que permite que un número de la app WhatsApp Business se conecte también a la API oficial. Así tu equipo atiende desde la bandeja de un CRM y tú sigues contestando desde el teléfono.",
        ],
      },
      {
        heading: `Cómo se conecta con ${BRAND_NAME}`,
        bullets: [
          "Creas tu cuenta y eliges conectar WhatsApp.",
          "Inicias sesión con Meta y autorizas el número.",
          "Los chats nuevos aparecen en la bandeja; lo que contestas desde el celular también queda registrado.",
        ],
      },
      {
        heading: "Qué conviene saber",
        paragraphs: [
          `${COEXISTENCE_PITCH} ${META_FEES_NOTE} Los requisitos y límites de la Coexistencia los define Meta y pueden cambiar; ${BRAND_NAME} te muestra en pantalla lo que Meta te pide.`,
        ],
      },
    ],
    faq: [
      { q: "¿Puedo seguir usando WhatsApp Business en mi celular?", a: "Sí, con la Coexistencia el mismo número funciona en la app y en la API." },
      { q: "¿Necesito un número nuevo?", a: "No necesariamente. Puedes conectar uno que ya uses, según los requisitos de Meta." },
      { q: "¿Quién cobra los mensajes de WhatsApp?", a: META_FEES_NOTE },
      { q: "¿Cuántos números puedo conectar?", a: "Cada licencia incluye un número de WhatsApp (además de Instagram, Messenger, Telegram y chat web)." },
    ],
    related: ["crm-whatsapp", "chatbot-whatsapp-ia"],
  },
  {
    slug: "whatsapp-business-app-vs-api",
    title: "WhatsApp Business app vs API: diferencias",
    h1: "WhatsApp Business app o API: cuál te conviene y en qué se diferencian",
    description: `Diferencias entre la app WhatsApp Business y la API oficial de Meta: equipo, automatización, bot, CRM y costos. Cuándo conviene cada una y cómo usar ambas con ${BRAND_NAME}.`,
    intro: "La app WhatsApp Business es gratis y se usa desde el celular. La API oficial se conecta a un software, como un CRM, para atender con varias personas y automatizar. No son excluyentes: con la Coexistencia de Meta puedes usar las dos con el mismo número.",
    sections: [
      {
        heading: "La app WhatsApp Business",
        bullets: [
          "Es gratis y se instala en el celular (y en WhatsApp Web y escritorio).",
          "Sirve para empezar: catálogo, etiquetas, respuestas rápidas y mensaje de bienvenida o de ausencia.",
          "Está pensada para una persona o un equipo muy pequeño, y no tiene CRM, reportes ni bot de IA propios.",
        ],
      },
      {
        heading: "La API oficial de WhatsApp Business",
        bullets: [
          "Se conecta a un software (un CRM, por ejemplo) y no tiene pantalla propia.",
          "Permite que varias personas atiendan desde la misma bandeja, con asignación de chats y tiempos de respuesta.",
          "Habilita bots, automatizaciones, difusiones con plantillas aprobadas por Meta y conexión con otros sistemas.",
          "Meta cobra algunos mensajes según su categoría; la app no los cobra.",
        ],
      },
      {
        heading: "Cuál elegir",
        paragraphs: [
          "Si atiendes solo y recibes pocos chats, la app puede alcanzarte. Cuando el volumen crece, se suma más gente al equipo o quieres que un bot conteste fuera de horario, necesitas la API.",
          `Con la Coexistencia no tienes que escoger. ${COEXISTENCE_PITCH}`,
        ],
      },
    ],
    faq: [
      { q: "¿Pierdo la app si paso a la API?", a: "Con la Coexistencia, no: el mismo número funciona en la app y en la API, según los requisitos de Meta." },
      { q: "¿La API de WhatsApp es gratis?", a: `${META_FEES_NOTE} El software que usas para conectarla tiene su propio precio.` },
      { q: "¿Necesito programar para usar la API?", a: `No. ${BRAND_NAME} se conecta con la API y te guía paso a paso; no necesitas escribir código.` },
      { q: "¿Puedo usar un bot con la app WhatsApp Business?", a: "La app solo permite mensajes automáticos sencillos (bienvenida y ausencia). Un bot que conteste preguntas requiere la API." },
    ],
    related: ["whatsapp-business-api-coexistencia", "precio-whatsapp-business-api"],
  },
  {
    slug: "precio-whatsapp-business-api",
    title: "Cuánto cuesta la API de WhatsApp Business",
    h1: "Cuánto cuesta la API de WhatsApp Business en México",
    description: `Qué pagas por usar la API de WhatsApp Business: el cobro de Meta por mensaje y el precio del software. Cómo calcularlo y cuánto cuesta ${BRAND_NAME} (desde $${OFFER_FROM_MXN} MXN por usuario).`,
    intro: "Usar la API oficial de WhatsApp Business tiene dos costos distintos: lo que cobra Meta por algunos mensajes y lo que cobra el software con el que te conectas. Conviene separarlos para comparar bien.",
    sections: [
      {
        heading: "1. Lo que cobra Meta",
        paragraphs: [
          "Meta cobra por mensaje, según su categoría (marketing, utilidad, autenticación o servicio) y el país del cliente. La tarifa vigente la publica Meta y puede cambiar, así que revísala en su lista de precios.",
          META_FEES_NOTE,
        ],
      },
      {
        heading: "2. Lo que cobra el software",
        paragraphs: [
          `En ${BRAND_NAME} pagas una licencia por persona al mes, en pesos mexicanos: desde $${OFFER_FROM_MXN} MXN con Básico, y Avanzado o Pro si necesitas bot, automatizaciones o API. Puedes mezclar licencias en el mismo equipo.`,
          `La prueba dura ${TRIAL_DAYS} días con todas las funciones, sin tarjeta.`,
        ],
      },
      {
        heading: "Cómo estimar tu gasto",
        bullets: [
          "Cuenta cuántas personas atenderán chats: eso define las licencias.",
          "Estima cuántos mensajes de plantilla (avisos y campañas) enviarás al mes: eso define buena parte del cobro de Meta.",
        ],
      },
    ],
    faq: [
      { q: "¿Cuánto cuesta la API de WhatsApp Business?", a: `Tiene dos partes: el cobro de Meta por ciertos mensajes y el precio del software. En ${BRAND_NAME}, el software parte de $${OFFER_FROM_MXN} MXN por usuario al mes.` },
      { q: "¿Los costos de Meta están incluidos en Colibly?", a: META_FEES_NOTE },
      { q: "¿Hay costo de instalación?", a: `No cobramos instalación. Creas tu cuenta, conectas tu número y pruebas ${TRIAL_DAYS} días sin tarjeta.` },
    ],
    related: ["whatsapp-business-app-vs-api", "crm-whatsapp"],
  },
];

export function guideBySlug(slug: string): Guide {
  const g = GUIDES.find((x) => x.slug === slug);
  if (!g) throw new Error(`Guía desconocida: ${slug}`);
  return g;
}
