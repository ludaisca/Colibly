import { TRIAL_DAYS } from "@/lib/billing/plans";
import { LICENSES, TRIAL_AI_CREDITS_PER_USER, TRIAL_MAX_USERS } from "@/lib/billing/licenses";
import { META_FEES_NOTE } from "@/lib/billing/plan-features";

// Preguntas frecuentes de la landing. Viven aquí (no en page.tsx) para que la
// página, su JSON-LD y /llms-full.txt lean el mismo texto.

export const FAQ = [
  {
    q: "¿Necesito tarjeta para la prueba?",
    a: `No. Tienes ${TRIAL_DAYS} días con todas las funciones (licencia Pro para hasta ${TRIAL_MAX_USERS} personas, ${TRIAL_AI_CREDITS_PER_USER} créditos de IA cada una), sin tarjeta. Al terminar contratas las licencias de tu equipo; si no lo haces, ese mismo día tu cuenta queda en solo lectura y tus datos se conservan.`,
  },
  {
    q: "¿Cómo conecto mi WhatsApp?",
    a: "Con la API oficial de WhatsApp Business de Meta. Cada persona de tu equipo puede conectar su propio número y seguir usándolo en el celular (Coexistencia). Te guiamos paso a paso.",
  },
  {
    q: "¿Cómo activo Instagram, Messenger, Telegram o el chat web?",
    a: "Con cualquier licencia. Cada persona de tu equipo trae un canal de cada tipo: un WhatsApp, un Instagram, un Messenger, un Telegram y un chat web. Cada canal funciona con la licencia de su dueño; por ejemplo, el bot responde en los canales de quien tiene Avanzado o Pro.",
  },
  {
    q: "¿Cómo se cobra?",
    a: `Cada persona de tu equipo paga una licencia, cada mes, en pesos: Básico $59, Avanzado $89 o Pro $149, y puedes mezclarlas (por ejemplo, tres Básico y un Pro). Empresarial es a la medida. ${META_FEES_NOTE}`,
  },
  {
    q: "¿Qué es un crédito de IA?",
    a: `Una respuesta del bot, una sugerencia, una calificación o un paso de IA. Son de cada persona: ${LICENSES.BUSINESS.aiCreditsPerMonth.toLocaleString("es-MX")} al mes con Avanzado y ${LICENSES.PRO.aiCreditsPerMonth.toLocaleString("es-MX")} con Pro (Básico no incluye IA). Lo que hace el bot en un chat usa los créditos del dueño de ese canal. Se renuevan en la fecha de facturación.`,
  },
  {
    q: "¿Puedo cambiar de plan o cancelar?",
    a: "Sí. Puedes cambiar la licencia de cada persona, agregar o quitar licencias, o cancelar cuando quieras. El pago es mensual y los cambios se prorratean.",
  },
  {
    q: "¿Los créditos que no uso se acumulan?",
    a: "No. Se restablecen en tu fecha de facturación. Si a alguien se le acaban antes, puedes subir su licencia a Pro.",
  },
  {
    q: "¿Mis datos están seguros?",
    a: "Cada empresa tiene su propio espacio aislado, las credenciales se guardan cifradas y solo las personas que invitas ven tus conversaciones.",
  },
];
