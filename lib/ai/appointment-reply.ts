// Qué le dice el bot al cliente cuando intentó agendar una cita. La cita se
// crea ANTES de responder (lib/workers/bot-worker.ts): la confirmación de "ya
// quedó" solo sale si existe la fila en Citas. Si no se pudo crear (sin
// contacto, fecha inválida, error de la base), el mensaje no lo afirma: un
// asesor la confirma. Puro, para pruebas.

export const APPOINTMENT_CONFIRMED = "¡Listo! Tu cita quedó agendada. Si necesitas cambiarla, escríbenos por aquí.";
export const APPOINTMENT_PENDING = "Gracias, ya tengo los datos de tu cita. Un asesor te la confirma por aquí en breve.";

// Frases con las que el modelo a veces da la cita por hecha aunque el contrato
// le pide no hacerlo: si la cita no se creó, esa respuesta no se envía.
// \b de JS no entiende acentos ("agendé"): se usan bordes por letra Unicode.
const W = "(?<![\\p{L}])";
const E = "(?![\\p{L}])";
const CONFIRMS_BOOKING = [
  `${W}(qued[oó]|est[aá])\\s+(tu\\s+cita\\s+)?(agendad|reservad|apartad|confirmad)[ao]s?${E}`,
  `${W}te\\s+(agend|reserv|apart)[eé]${E}`,
  `${W}(ya\\s+)?(agend|reserv|apart)[eé]\\s+(tu|la)\\s+cita${E}`,
  `${W}cita\\s+(agendada|confirmada|reservada)${E}`,
].map((source) => new RegExp(source, "iu"));

export function claimsBooking(text: string): boolean {
  return CONFIRMS_BOOKING.some((re) => re.test(text));
}

export function composeAppointmentReply(input: {
  cleanText: string;
  /** El modelo escribió un bloque ```appointment (válido o no). */
  hadMarker: boolean;
  /** Se pidió crear una cita (bloque válido). */
  proposed: boolean;
  /** La cita existe en la base. */
  booked: boolean;
}): string {
  const text = input.cleanText.trim();
  if (input.proposed && input.booked) {
    if (!text) return APPOINTMENT_CONFIRMED;
    // El modelo ya pudo haberlo dicho; si no, se agrega la confirmación.
    return claimsBooking(text) ? text : `${text}\n\n${APPOINTMENT_CONFIRMED}`;
  }
  if (input.hadMarker || input.proposed) {
    // Intentó agendar y no se pudo: nunca "ya quedó".
    if (!text || claimsBooking(text)) return APPOINTMENT_PENDING;
    return `${text}\n\n${APPOINTMENT_PENDING}`;
  }
  return text;
}
