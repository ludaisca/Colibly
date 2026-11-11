import { describe, expect, it } from "vitest";
import { APPOINTMENT_CONFIRMED, APPOINTMENT_PENDING, claimsBooking, composeAppointmentReply } from "../appointment-reply";
import { parseAppointmentMarker } from "../appointment-marker";

const TZ = "America/Mexico_City";
const future = new Date(Date.now() + 3 * 864e5).toLocaleDateString("en-CA", { timeZone: TZ });
const block = (json: string) => `Perfecto, el sábado a las 11:00.\n\`\`\`appointment\n${json}\n\`\`\``;

describe("claimsBooking", () => {
  it("detecta cuando el texto da la cita por hecha", () => {
    expect(claimsBooking("¡Listo! Tu cita quedó agendada")).toBe(true);
    expect(claimsBooking("Te agendé el sábado a las 11")).toBe(true);
    expect(claimsBooking("Ya reservé tu cita para el lunes")).toBe(true);
    expect(claimsBooking("Perfecto, el sábado a las 11:00.")).toBe(false);
    expect(claimsBooking("¿Te gustaría agendar una cita?")).toBe(false);
  });
});

describe("composeAppointmentReply", () => {
  it("cita creada: confirma (agrega la confirmación si el modelo no la dijo)", () => {
    expect(composeAppointmentReply({ cleanText: "Perfecto, el sábado a las 11:00.", hadMarker: true, proposed: true, booked: true })).toBe(
      `Perfecto, el sábado a las 11:00.\n\n${APPOINTMENT_CONFIRMED}`
    );
    expect(composeAppointmentReply({ cleanText: "", hadMarker: true, proposed: true, booked: true })).toBe(APPOINTMENT_CONFIRMED);
  });
  it("no se pudo crear (sin contacto o error): nunca dice que quedó", () => {
    const out = composeAppointmentReply({ cleanText: "¡Listo! Tu cita quedó agendada para el sábado.", hadMarker: true, proposed: true, booked: false });
    expect(out).toBe(APPOINTMENT_PENDING);
    expect(composeAppointmentReply({ cleanText: "Perfecto, el sábado.", hadMarker: true, proposed: true, booked: false })).toBe(
      `Perfecto, el sábado.\n\n${APPOINTMENT_PENDING}`
    );
  });
  it("bloque descartado (fecha o JSON inválidos): tampoco confirma", () => {
    expect(composeAppointmentReply({ cleanText: "Te agendé el sábado.", hadMarker: true, proposed: false, booked: false })).toBe(APPOINTMENT_PENDING);
  });
  it("sin intento de cita, el texto pasa igual", () => {
    expect(composeAppointmentReply({ cleanText: "Abrimos de 9 a 7.", hadMarker: false, proposed: false, booked: false })).toBe("Abrimos de 9 a 7.");
  });
});

describe("parseAppointmentMarker + hadMarker", () => {
  it("marca hadMarker aunque el bloque se descarte", () => {
    const bad = parseAppointmentMarker(block('{"title":"Facial","date":"2020-01-01","time":"11:00"}'), TZ);
    expect(bad.proposal).toBeNull();
    expect(bad.hadMarker).toBe(true);
    expect(bad.cleanText).toBe("Perfecto, el sábado a las 11:00.");
  });
  it("bloque válido: propuesta y texto limpio", () => {
    const ok = parseAppointmentMarker(block(`{"title":"Facial","date":"${future}","time":"11:00","durationMinutes":60,"notes":null}`), TZ);
    expect(ok.proposal?.title).toBe("Facial");
    expect(ok.hadMarker).toBe(true);
  });
  it("sin bloque: hadMarker false", () => {
    expect(parseAppointmentMarker("Hola", TZ).hadMarker).toBe(false);
  });
});
