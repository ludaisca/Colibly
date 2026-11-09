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
  /** Última revisión del contenido (AAAA-MM-DD): sitemap y JSON-LD. Se actualiza al editar la guía. */
  updated: string;
};

/** Fecha de revisión de las guías iniciales. */
const REVIEWED = "2026-11-09";

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
    updated: REVIEWED,
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
    updated: REVIEWED,
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
    updated: REVIEWED,
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
    updated: REVIEWED,
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
    updated: REVIEWED,
  },
  {
    slug: "respuestas-automaticas-whatsapp",
    title: "Respuestas automáticas en WhatsApp",
    h1: "Respuestas automáticas en WhatsApp: bienvenida, fuera de horario y seguimiento",
    description: `Cómo automatizar respuestas en WhatsApp: mensaje de bienvenida, aviso fuera de horario, respuestas rápidas, bot de IA y seguimientos. Todo en ${BRAND_NAME}, ${TRIAL_DAYS} días gratis.`,
    intro: "Contestar rápido es lo que más pesa en una venta por chat. Automatizar lo repetitivo te deja el tiempo para lo que sí necesita a una persona. Estas son las formas de hacerlo, de la más sencilla a la más completa.",
    sections: [
      {
        heading: "Aviso fuera de horario",
        paragraphs: [
          "Defines tu horario de atención y un texto. Si alguien escribe fuera de ese horario, recibe tu aviso una vez, no en cada mensaje, y el chat queda esperando a tu equipo. Si tienes un bot activo, contesta el bot.",
        ],
      },
      {
        heading: "Respuestas rápidas",
        paragraphs: [
          "Guardas los textos que repites (precios, ubicación, formas de pago) y los insertas en un clic mientras atiendes. No son automáticas: ahorran tiempo a tu equipo y mantienen la misma redacción.",
        ],
      },
      {
        heading: "Automatizaciones y seguimientos",
        bullets: [
          "Respuestas que se disparan con una palabra clave o con el primer mensaje de un cliente.",
          "Secuencias de seguimiento: una serie de mensajes con pausas entre ellos, que se detiene si el cliente responde.",
          "Acciones al cambiar la etapa de una venta, al etiquetar un contacto o al completar una cita.",
        ],
      },
      {
        heading: "Bot de IA",
        paragraphs: [
          "Cuando las preguntas son variadas, un bot de IA contesta con la información de tu negocio y pasa el chat a una persona si hace falta. Las automatizaciones y el bot vienen con las licencias Avanzado y Pro.",
        ],
      },
    ],
    faq: [
      { q: "¿WhatsApp permite mandar mensajes automáticos?", a: "Sí, con la API oficial. Los mensajes que inicias tú fuera de la ventana de 24 horas deben ser plantillas aprobadas por Meta." },
      { q: "¿El aviso fuera de horario se manda en cada mensaje?", a: "No. Se envía una vez y respeta un tiempo de espera antes de repetirse." },
      { q: "¿Puedo pausar la automatización si quiero contestar yo?", a: "Sí. Cuando una persona de tu equipo responde, el bot y las automatizaciones conversacionales se pausan en ese chat." },
    ],
    related: ["chatbot-whatsapp-ia", "crm-whatsapp"],
    updated: REVIEWED,
  },
  {
    slug: "agendar-citas-whatsapp",
    title: "Agendar citas por WhatsApp",
    h1: "Agendar citas por WhatsApp sin perder el hilo de la conversación",
    description: `Lleva la agenda de citas junto al chat de cada cliente: quién tiene cita, con quién y en qué estado. Agenda, seguimiento y aviso al equipo con ${BRAND_NAME}.`,
    intro: "Muchas citas se acuerdan por WhatsApp y se anotan en otra parte, donde se olvidan. Si la cita vive en la ficha del mismo contacto que te escribió, nada se pierde entre el chat y la agenda.",
    sections: [
      {
        heading: "La cita junto al cliente",
        bullets: [
          "Agendas la cita desde la ficha del contacto, con fecha, duración y notas.",
          "Cada cita se asigna a una persona del equipo.",
          "Ves la agenda del día y lo que viene, con filtros por persona y estado.",
          "Estados: programada, completada, cancelada o no asistió; las canceladas guardan el motivo.",
        ],
      },
      {
        heading: "Avisos y seguimiento",
        paragraphs: [
          "Antes de cada cita, la persona asignada recibe un aviso dentro del sistema con la anticipación que elijas. Al completar la cita puedes disparar un seguimiento automático, por ejemplo un mensaje para pedir una opinión o proponer la siguiente visita.",
        ],
      },
      {
        heading: "Para quién sirve",
        paragraphs: [
          "Consultorios, spas, salones, talleres, escuelas y cualquier negocio que atienda con cita. El calendario y las citas están incluidos desde la licencia Básica.",
        ],
      },
    ],
    faq: [
      { q: "¿Los clientes reciben un recordatorio de su cita?", a: "El aviso previo llega a la persona del equipo asignada. Para escribirle al cliente puedes usar una secuencia de seguimiento al completar la cita." },
      { q: "¿Puedo ver las citas de todo el equipo?", a: "Los administradores ven las citas de toda la organización y los ejecutivos, las que tienen asignadas." },
      { q: "¿Hay que pagar aparte por el calendario?", a: "No. Las citas vienen en todas las licencias." },
    ],
    related: ["crm-whatsapp", "respuestas-automaticas-whatsapp"],
    updated: REVIEWED,
  },
  {
    slug: "crm-whatsapp-clinicas",
    title: "CRM de WhatsApp para clínicas y consultorios",
    h1: "CRM de WhatsApp para clínicas y consultorios",
    description: `Atiende pacientes por WhatsApp, lleva citas y da seguimiento desde una bandeja compartida. ${BRAND_NAME}: para consultorios y clínicas, ${TRIAL_DAYS} días gratis.`,
    intro: "En un consultorio, WhatsApp es la recepción: citas, dudas de precio, reprogramaciones y seguimiento. Un CRM ordena esos chats para que ninguno se quede sin respuesta y toda la recepción vea lo mismo.",
    sections: [
      {
        heading: "Qué resuelve en una clínica",
        bullets: [
          "Una bandeja para toda la recepción, con chats asignados a una persona o a un equipo (por ejemplo, Recepción y Facturación).",
          "Agenda de citas ligada al paciente, con estados y aviso previo al equipo.",
          "Etiquetas para clasificar (primera vez, seguimiento, especialidad).",
          "Seguimiento después de la consulta con mensajes programados.",
          "Un bot que contesta horarios, ubicación y precios de consulta, y deja lo clínico a tu equipo.",
        ],
      },
      {
        heading: "Sobre los datos de tus pacientes",
        paragraphs: [
          `Cada empresa tiene su propio espacio aislado y las credenciales se guardan cifradas. Lo que tus pacientes te comparten por chat es información personal: usa un aviso de privacidad propio y evita pedir por WhatsApp datos clínicos que no necesites. ${BRAND_NAME} no sustituye tus obligaciones de protección de datos.`,
        ],
      },
    ],
    faq: [
      { q: "¿Puede el bot dar diagnósticos?", a: "No es su función. Se configura para contestar información de tu consultorio (horarios, ubicación, precios) y pasar a una persona lo demás." },
      { q: "¿Mi recepción puede trabajar en equipo?", a: "Sí. Varias personas atienden la misma bandeja y los chats se reparten por persona o por equipo." },
      { q: "¿Sirve para un consultorio de una sola persona?", a: `Sí. Con una licencia atiendes tus chats y llevas tus citas. Pruébalo ${TRIAL_DAYS} días sin tarjeta.` },
    ],
    related: ["agendar-citas-whatsapp", "chatbot-whatsapp-ia"],
    updated: REVIEWED,
  },
  {
    slug: "crm-whatsapp-spas-y-belleza",
    title: "CRM de WhatsApp para spas y salones de belleza",
    h1: "CRM de WhatsApp para spas, salones y negocios de belleza",
    description: `Responde precios, agenda citas y da seguimiento a tus clientas por WhatsApp desde una bandeja. ${BRAND_NAME} para spas y salones, ${TRIAL_DAYS} días gratis.`,
    intro: "Un spa o un salón vive de la agenda llena. La mayoría de las clientas preguntan precio y horario por WhatsApp, a cualquier hora. Responder rápido y dar seguimiento es lo que convierte esa pregunta en una cita.",
    sections: [
      {
        heading: "Cómo se usa en un spa o salón",
        bullets: [
          "El bot contesta precios, duración de los servicios y horarios con la información que le das, también fuera de horario.",
          "La recepción toma el chat cuando la clienta quiere agendar, y la cita queda en su ficha.",
          "Etiquetas por servicio de interés y por tipo de clienta.",
          "Seguimiento automático después de la cita, y difusiones con plantillas aprobadas para avisar de promociones (licencias Avanzado y Pro).",
          "Instagram y Messenger en la misma bandeja que WhatsApp, para no perder a quien escribe por ahí.",
        ],
      },
    ],
    faq: [
      { q: "¿El bot puede decir los precios de mis servicios?", a: "Sí, siempre que se los des en su base de conocimiento. Contesta con lo que sabe de tu negocio." },
      { q: "¿Puedo mandar promociones a mis clientas?", a: "Con las licencias Avanzado y Pro puedes hacer difusiones de WhatsApp con plantillas aprobadas por Meta. Meta cobra algunos de esos mensajes." },
      { q: "¿Puedo atender también Instagram?", a: "Sí. Cada licencia incluye un Instagram y un Messenger además del WhatsApp." },
    ],
    related: ["agendar-citas-whatsapp", "chatbot-whatsapp-ia"],
    updated: REVIEWED,
  },
  {
    slug: "crm-whatsapp-tiendas",
    title: "CRM de WhatsApp para tiendas y ventas en línea",
    h1: "CRM de WhatsApp para tiendas y negocios que venden por chat",
    description: `Atiende preguntas de producto, da seguimiento a cada venta y no pierdas pedidos por WhatsApp, Instagram y Messenger. ${BRAND_NAME} para tiendas, ${TRIAL_DAYS} días gratis.`,
    intro: "Quien vende por chat recibe preguntas de producto, tallas, envíos y pagos en varios canales a la vez. Sin un sistema, los pedidos se enfrían entre mensajes. Con un CRM, cada cliente tiene su historial y cada venta, su etapa.",
    sections: [
      {
        heading: "Cómo ayuda a una tienda",
        bullets: [
          "WhatsApp, Instagram, Messenger, Telegram y el chat de tu sitio llegan a una sola bandeja.",
          "Embudo de ventas para ver qué pedidos están en conversación, por cerrar o cerrados.",
          "Etiquetas y campos personalizados para guardar lo que importa (talla, ciudad, producto de interés).",
          "El bot responde preguntas frecuentes (envíos, formas de pago, horarios) y tu equipo cierra la venta.",
          "Seguimiento a quienes preguntaron y no compraron, y reportes de atención y de ventas.",
        ],
      },
      {
        heading: "Para quién conviene",
        paragraphs: [
          "Tiendas físicas con venta por chat, marcas que venden por Instagram y emprendimientos que atienden desde el celular y están por sumar a más personas al equipo.",
        ],
      },
    ],
    faq: [
      { q: "¿Tiene carrito de compra o catálogo?", a: `No. ${BRAND_NAME} es un CRM y una bandeja para atender y dar seguimiento; el cobro y el inventario los llevas en tu sistema actual.` },
      { q: "¿Se conecta con otros sistemas?", a: "Con las licencias Pro tienes API y webhooks para conectarlo con tu tienda u otras herramientas." },
      { q: "¿Cuántos canales incluye cada licencia?", a: "Un WhatsApp, un Instagram, un Messenger, un Telegram y un chat web por persona." },
    ],
    related: ["crm-whatsapp", "respuestas-automaticas-whatsapp"],
    updated: REVIEWED,
  },
];

export function guideBySlug(slug: string): Guide {
  const g = GUIDES.find((x) => x.slug === slug);
  if (!g) throw new Error(`Guía desconocida: ${slug}`);
  return g;
}
