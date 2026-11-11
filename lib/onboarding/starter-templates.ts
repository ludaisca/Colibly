// Plantillas de arranque para los estados vacíos de Bots IA, Monitores IA y
// Secuencias (las de Automatizaciones viven en lib/automations/templates.ts y
// aquí solo se eligen). Son un punto de partida editable: abren el formulario
// con estos valores y la persona los ajusta a su negocio antes de guardar.
// Pensadas para un spa, clínica, inmobiliaria o tienda en México.

export interface StarterTemplate<P> {
  id: string;
  title: string;
  description: string;
  preset: P;
}

export interface BotPreset {
  name: string;
  systemPrompt: string;
  appointmentSchedulingEnabled?: boolean;
  ragEnabled?: boolean;
}

export const BOT_TEMPLATES: StarterTemplate<BotPreset>[] = [
  {
    id: "citas",
    title: "Bot de citas",
    description: "Saluda, ofrece horarios y agenda la cita cuando el cliente confirma día y hora.",
    preset: {
      name: "Bot de citas",
      appointmentSchedulingEnabled: true,
      systemPrompt: [
        "Eres la recepcionista virtual de [nombre del negocio]. Hablas con calidez, en español de México y con mensajes cortos.",
        "Tu objetivo es agendar citas. Pregunta qué servicio le interesa, ofrece los horarios disponibles ([días y horario]) y pide que confirme explícitamente el día y la hora.",
        "No des una cita por agendada hasta que el cliente confirme el día y la hora. Si pide algo que no sabes (precios especiales, cambios de último minuto), dile que un asesor le escribe en breve.",
      ].join("\n\n"),
    },
  },
  {
    id: "faq",
    title: "Bot de preguntas y precios",
    description: "Responde qué vendes, precios y horarios con tu base de conocimiento; si no sabe, pasa a una persona.",
    preset: {
      name: "Bot de preguntas frecuentes",
      ragEnabled: true,
      systemPrompt: [
        "Eres el asistente de [nombre del negocio]. Respondes en español de México, con amabilidad y en mensajes cortos.",
        "Contesta preguntas sobre servicios, precios, horarios, ubicación y formas de pago usando solo la información de la base de conocimiento.",
        "Si no tienes el dato o la pregunta es delicada (quejas, pagos, cancelaciones), no inventes: dile que una persona del equipo le responde en breve.",
      ].join("\n\n"),
    },
  },
];

/** El tercer camino de Bots: clasificar y etiquetar es una automatización que ya existe. */
export const CLASSIFY_AUTOMATION_HREF = "/whatsapp/automatizaciones?plantilla=ai_triage";

export interface MonitorPreset {
  name: string;
  description: string;
}

export const MONITOR_TEMPLATES: StarterTemplate<MonitorPreset>[] = [
  {
    id: "quejas",
    title: "Quejas o clientes molestos",
    description: "Te avisa cuando alguien reclama, está molesto o amenaza con irse.",
    preset: { name: "Quejas", description: "El cliente se queja, está molesto, reclama un mal servicio o amenaza con dejar de comprar." },
  },
  {
    id: "compra",
    title: "Intención de compra",
    description: "Detecta a quien pregunta precio, disponibilidad o cómo pagar.",
    preset: { name: "Intención de compra", description: "El cliente pregunta precios, disponibilidad, formas de pago o cómo comprar o reservar." },
  },
  {
    id: "cancelar",
    title: "Quiere cancelar",
    description: "Avisa cuando alguien quiere cancelar, devolver o no continuar.",
    preset: { name: "Intención de cancelar", description: "El cliente quiere cancelar una cita, un pedido o un servicio, pedir una devolución o no continuar." },
  },
];

export interface SequencePreset {
  name: string;
  triggerType: "TAG_ADDED" | "LEAD_STATUS_CHANGED" | "APPOINTMENT_COMPLETED";
  /** Para LEAD_STATUS_CHANGED: la etapa. Para TAG_ADDED se elige la etiqueta en el formulario. */
  triggerValue?: string;
  exitOnReply: boolean;
  steps: Array<{ delayMinutes: number; message: string }>;
}

// Los pasos caben en la ventana de 24 h de WhatsApp (un texto libre después
// de 24 h sin respuesta del cliente no se entrega).
export const SEQUENCE_TEMPLATES: StarterTemplate<SequencePreset>[] = [
  {
    // Disparo por etiqueta (no por la etapa «Nuevo»: un lead nace en Nuevo, no
    // "cambia" a Nuevo, así que ese disparador nunca saltaría).
    id: "seguimiento-interesados",
    title: "Seguimiento a interesados",
    description: "Dos recordatorios amables cuando etiquetas a alguien (p. ej. «Interesado») y no ha cerrado.",
    preset: {
      name: "Seguimiento a interesados",
      triggerType: "TAG_ADDED",
      exitOnReply: true,
      steps: [
        { delayMinutes: 120, message: "¡Hola! ¿Pudiste revisar la información que te compartimos? Si tienes alguna duda, aquí estoy para ayudarte." },
        { delayMinutes: 1200, message: "Te escribo de nuevo por si te interesa apartar tu lugar esta semana. ¿Te comparto los horarios disponibles?" },
      ],
    },
  },
  {
    id: "post-cita",
    title: "Gracias después de la cita",
    description: "Agradece la visita y pide que califique el servicio.",
    preset: {
      name: "Gracias después de la cita",
      triggerType: "APPOINTMENT_COMPLETED",
      exitOnReply: false,
      steps: [{ delayMinutes: 60, message: "¡Gracias por visitarnos hoy! ¿Cómo calificarías tu experiencia del 1 al 5? Tu opinión nos ayuda mucho." }],
    },
  },
  {
    id: "reenganche",
    title: "Reenganche suave",
    description: "A quien marcaste como contactado y no volvió a escribir; se detiene si responde.",
    preset: {
      name: "Reenganche suave",
      triggerType: "LEAD_STATUS_CHANGED",
      triggerValue: "CONTACTED",
      exitOnReply: true,
      steps: [
        { delayMinutes: 240, message: "Hola, ¿sigues interesado? Si quieres, te ayudo a resolver cualquier duda." },
        { delayMinutes: 1080, message: "Último recordatorio de hoy: si te late, te aparto un lugar. Solo respóndeme por aquí." },
      ],
    },
  },
];
