// Citas — Fase 2 (roadmap docs/ROADMAP_PANCAKE.md → "P1 — Citas / Appointments").
// Mismo patrón que lib/whatsapp/lead-scoring.ts: un marcador estructurado en la
// respuesta del modelo, NO function/tool-calling real (los providers OpenCode y
// Google lo implementan de forma distinta, y esta es la única feature que lo
// necesitaría hoy). A diferencia del contrato del calificador de leads —donde TODA
// la respuesta es el JSON— aquí el bloque es un anexo opcional al final de una
// respuesta conversacional normal: parseAppointmentMarker() debe devolver siempre
// el texto “limpio” (sin el bloque) para enviarlo al cliente, se haya detectado
// una propuesta de cita o no.

export interface AppointmentProposal {
  title: string;
  scheduledAt: Date;
  durationMinutes: number;
  notes: string | null;
}

// Construye el contrato de sistema para el bot. `now`/`timeZone` vienen de
// AppSettings.leadRecoveryTimezone del dueño del bot (reutilizada — es la única
// noción de "en qué zona horaria opera este negocio" que ya existe en el
// schema; no se agrega un campo nuevo solo para esto) para que el modelo pueda
// resolver expresiones relativas ("mañana", "el viernes a las 3") contra una
// fecha de referencia real en vez de la fecha de entrenamiento del modelo.
export function buildAppointmentMarkerContract(now: Date, timeZone: string): string {
  const todayLabel = new Intl.DateTimeFormat("es-MX", { timeZone, dateStyle: "full" }).format(now);
  const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone, dateStyle: "short" }).format(now); // YYYY-MM-DD

  return `Además, puedes agendar citas para el negocio. Hoy es ${todayLabel} (${todayIso}, zona horaria ${timeZone}) — usa esta fecha como referencia para expresiones relativas ("mañana", "el viernes", "en dos días").

Si —y SOLO si— el lead confirmó explícitamente una fecha y hora concretas para una cita en su ÚLTIMO mensaje (no basta con que muestre interés en agendar), después de tu respuesta normal al cliente agrega, en una línea aparte, un bloque \`\`\`appointment ... \`\`\` con esta forma exacta:
{"title": string (breve, ej. "Cita con Juan Pérez" o el motivo/servicio), "date": "YYYY-MM-DD", "time": "HH:mm" (24h, zona horaria ${timeZone}), "durationMinutes": number (o null para usar 30 por defecto), "notes": string|null}

Reglas:
- Si el lead solo pregunta disponibilidad, propone una fecha sin que tú la hayas confirmado, o la conversación es ambigua, NO agregues el bloque — responde normal y pide la confirmación que falte.
- Nunca menciones el bloque ni su contenido al cliente; es una instrucción interna, no algo que él deba ver.
- Nunca agregues el bloque más de una vez por respuesta.
- Tu respuesta visible al cliente debe confirmar la cita en lenguaje natural igual — el bloque es además de eso, no en lugar de eso.`;
}

// Se admite tanto una fecha/hora al inicio de una línea como en medio de la
// respuesta (algunos modelos no respetan "en una línea aparte" al pie de la
// letra); [\s\S] en vez de "." + /s para no depender del flag "s" de regex.
// Dos variantes de la misma expresión: MARKER_RE (sin "g") para extraer el
// primer bloque vía capture group con .match(); MARKER_RE_ALL (con "g", sin
// capture group real que .replace() necesite) para limpiar TODOS los bloques
// del texto visible — si el modelo viola la regla de "nunca más de un bloque
// por respuesta" y agrega dos, el segundo no debe llegar como JSON crudo al
// cliente solo porque únicamente el primero se usó como propuesta.
const MARKER_RE = /```appointment\s*([\s\S]*?)```/;
const MARKER_RE_ALL = /```appointment\s*[\s\S]*?```/g;

export function parseAppointmentMarker(
  raw: string,
  timeZone: string
): { cleanText: string; proposal: AppointmentProposal | null } {
  const match = raw.match(MARKER_RE);
  const cleanText = raw.replace(MARKER_RE_ALL, "").trim();
  if (!match) return { cleanText, proposal: null };

  // Cualquier retorno null de aquí en adelante significa "había un bloque,
  // pero se descartó" — a diferencia de "no había bloque" (el caso normal en
  // la mayoría de turnos). Sin este log no queda ningún rastro de que el
  // cliente recibió una confirmación en lenguaje natural sin que la cita se
  // haya creado de verdad — el único síntoma visible sería un cliente
  // reclamando que "no le llegó" una cita que el bot le dijo que sí agendó.
  const reject = (reason: string) => {
    console.warn(`[appointment-marker] Bloque appointment descartado (${reason}):`, match![1]?.slice(0, 500));
    return { cleanText, proposal: null };
  };

  try {
    const data = JSON.parse(match[1]);
    const title = typeof data.title === "string" ? data.title.trim().slice(0, 200) : "";
    const dateOk = typeof data.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.date);
    const timeOk = typeof data.time === "string" && /^\d{2}:\d{2}$/.test(data.time);
    if (!title || !dateOk || !timeOk) return reject("título/fecha/hora inválidos");

    const scheduledAt = zonedDateTimeToUtc(data.date, data.time, timeZone);
    // Descartar propuestas en el pasado — típicamente el modelo confundió el
    // año o la zona horaria. Mejor no agendar que agendar mal; el texto visible
    // ya se envía igual, el lead solo no ve la cita reflejada en el CRM.
    if (scheduledAt.getTime() <= Date.now()) return reject("fecha resuelta en el pasado");

    const duration = Number(data.durationMinutes);
    const durationMinutes = Number.isFinite(duration) && duration >= 5 && duration <= 480 ? Math.round(duration) : 30;
    const notes = typeof data.notes === "string" && data.notes.trim() ? data.notes.trim().slice(0, 2000) : null;

    return { cleanText, proposal: { title, scheduledAt, durationMinutes, notes } };
  } catch {
    return reject("JSON inválido");
  }
}

// "YYYY-MM-DD" + "HH:mm" tal como se viven en `timeZone` → instante UTC real.
// Sin dependencia nueva (luxon/date-fns-tz): se construye una fecha ingenua
// asumiendo UTC y se mide el corrimiento real de esa zona en ese instante
// comparando cómo Intl formatea la misma fecha en la zona objetivo vs. en UTC
// — funciona correctamente incluso cruzando cambios de horario de verano.
function zonedDateTimeToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  const naiveUtc = new Date(`${dateStr}T${timeStr}:00Z`);
  const asIfInTz = new Date(naiveUtc.toLocaleString("en-US", { timeZone }));
  const asIfInUtc = new Date(naiveUtc.toLocaleString("en-US", { timeZone: "UTC" }));
  const offsetMs = asIfInUtc.getTime() - asIfInTz.getTime();
  return new Date(naiveUtc.getTime() + offsetMs);
}
