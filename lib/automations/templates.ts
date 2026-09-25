import { shortId } from "./graph";
import type { Branch, Graph, Option, Step, Trigger } from "./types";

// Plantillas de inicio de la galería "Nueva automatización". Cada llamada
// genera ids nuevos (dos automatizaciones creadas desde la misma plantilla no
// comparten ids de opción/rama). Módulo sin dependencias de servidor: el
// editor lo importa para la vista previa de la galería.

export interface AutomationTemplate {
  id: string;
  name: string;
  description: string;
  build: () => Graph;
}

const g = (trigger: Trigger, steps: Step[]): Graph => ({ version: 1, trigger, steps });
const text = (t: string): Step => ({ id: shortId("s"), type: "send_text", config: { text: t } });
const branch = (key: string, label: string, steps: Step[] = []): Branch => ({ id: shortId("b"), key, label, steps });

export function buttonsStep(textBody: string, titles: string[], build: (o: Option) => Step[] = () => []): Step {
  const options = titles.map((title) => ({ id: shortId("o"), title }));
  return {
    id: shortId("s"),
    type: "send_buttons",
    config: { text: textBody, options, timeoutMinutes: 24 * 60, fallback: "reprompt", aiMatch: true },
    branches: [...options.map((o) => branch(o.id, o.title, build(o))), branch("other", "Otra respuesta"), branch("timeout", "Sin respuesta")],
  };
}

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    id: "blank",
    name: "En blanco",
    description: "Empieza desde cero con una palabra clave y un mensaje.",
    build: () => g({ type: "keyword", keywords: ["hola"], match: "contains" }, [text("¡Hola {{nombre}}! 👋 ¿En qué te ayudamos?")]),
  },
  {
    id: "welcome_menu",
    name: "Menú de bienvenida",
    description: "Saluda a quien escribe por primera vez y le ofrece opciones con botones.",
    build: () =>
      g({ type: "first_message" }, [
        buttonsStep("¡Hola {{nombre}}! 👋 Bienvenido. ¿En qué te podemos ayudar?", ["Ver precios", "Agendar cita", "Hablar con alguien"], (o) => {
          if (o.title === "Ver precios") return [text("Te comparto nuestros precios: …\n\nEscribe *menú* para volver a ver las opciones.")];
          if (o.title === "Agendar cita") {
            return [
              {
                id: shortId("s"),
                type: "wait_for_reply",
                config: { timeoutMinutes: 12 * 60, validation: "any", saveToVar: "preferencia", saveToCustomField: null, invalidMessage: null },
                branches: [
                  branch("answered", "Respondió", [
                    { id: shortId("s"), type: "notify_team", config: { target: "assignee", userId: null, title: "Solicitud de cita: {{nombre}}", body: "Preferencia: {{var.preferencia}}" } },
                    text("¡Perfecto! Un asesor te confirma el horario en breve 🙌"),
                  ]),
                  branch("timeout", "Sin respuesta"),
                ],
              },
            ];
          }
          return [{ id: shortId("s"), type: "handoff", config: { message: "Te comunico con una persona del equipo 🙌", assign: "auto" } }];
        }),
      ]),
  },
  {
    id: "ai_triage",
    name: "Clasificar con IA y enrutar",
    description: "La IA entiende qué quiere el cliente y lo manda por el camino correcto.",
    build: () => {
      const categories = [
        { id: shortId("c"), label: "Precios", description: "Pregunta costos, promociones o formas de pago" },
        { id: shortId("c"), label: "Cita", description: "Quiere agendar, cambiar o cancelar una cita" },
        { id: shortId("c"), label: "Queja", description: "Reporta un problema o está molesto" },
      ];
      return g({ type: "first_message" }, [
        {
          id: shortId("s"),
          type: "ai_classify",
          config: { instructions: "", categories },
          branches: [
            branch(categories[0].id, "Precios", [{ id: shortId("s"), type: "add_tag", config: { tagName: "Interesado" } }, { id: shortId("s"), type: "ai_reply", config: {} }]),
            branch(categories[1].id, "Cita", [
              { id: shortId("s"), type: "set_lead_status", config: { status: "QUALIFIED" } },
              { id: shortId("s"), type: "handoff", config: { message: "¡Claro! Te comunico con quien agenda 📅", assign: "auto" } },
            ]),
            branch(categories[2].id, "Queja", [
              { id: shortId("s"), type: "add_tag", config: { tagName: "Queja" } },
              { id: shortId("s"), type: "handoff", config: { message: "Lamentamos lo ocurrido. Una persona del equipo te atiende en seguida.", assign: "auto" } },
            ]),
            branch("other", "Otro", [{ id: shortId("s"), type: "ai_reply", config: {} }]),
          ],
        },
      ]);
    },
  },
  {
    id: "ad_lead",
    name: "Lead de anuncio",
    description: "Etiqueta, asigna y saluda al instante a quien llega de un anuncio de Meta.",
    build: () =>
      g({ type: "ad_lead", origin: "ANY" }, [
        { id: shortId("s"), type: "add_tag", config: { tagName: "Anuncio" } },
        { id: shortId("s"), type: "assign", config: { mode: "auto", userId: null } },
        text("¡Hola {{nombre}}! Gracias por tu interés en nuestro anuncio 🙌 ¿Te gustaría agendar?"),
      ]),
  },
  {
    id: "post_appointment",
    name: "Seguimiento post-cita",
    description: "Agradece después de la cita y pide calificar el servicio.",
    build: () =>
      g({ type: "appointment_completed" }, [
        { id: shortId("s"), type: "wait", config: { minutes: 120 } },
        buttonsStep("¡Gracias por visitarnos, {{nombre}}! ¿Cómo calificarías tu experiencia?", ["Excelente", "Buena", "Mejorable"], (o) =>
          o.title === "Mejorable"
            ? [
                { id: shortId("s"), type: "notify_team", config: { target: "assignee", userId: null, title: "Experiencia mejorable: {{nombre}}", body: "Revisa la conversación." } },
                text("Gracias por decirnos. Alguien del equipo te contactará para mejorar 🙏"),
              ]
            : [text("¡Nos alegra mucho! Te esperamos pronto 🌿")]
        ),
      ]),
  },
];
