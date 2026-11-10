// Textos de ayuda "¿Qué es esto?" (HelpHint). Un solo lugar para que cada
// término se explique igual en toda la app. Español de México, tuteo.

export const GLOSSARY = {
  window24h: "WhatsApp solo te deja escribir libremente 24 h después del último mensaje del cliente. Después necesitas una plantilla aprobada.",
  qualifiers: "La IA lee la conversación y le pone una calificación al lead (caliente, tibio, frío) para que sepas a quién atender primero.",
  monitors: "Te avisan cuando en tus chats se menciona un tema que te importa (quejas, cancelaciones, competencia).",
  sequences: "Mensajes de seguimiento que salen solos en días programados, p. ej. día 1, día 3 y día 7.",
  funnel: "Las etapas por las que pasa un cliente, de nuevo a ganado o perdido. Arrastra las tarjetas para moverlas.",
  manualConnection: "Para equipos técnicos que ya tienen una app de Meta. Si no sabes qué es, usa «Continuar con Facebook».",
} as const;

export type GlossaryKey = keyof typeof GLOSSARY;
