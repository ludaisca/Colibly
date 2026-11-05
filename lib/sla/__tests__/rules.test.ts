import { describe, expect, it } from "vitest";
import { addBusinessMinutes, formatSlaMinutes, slaBreachFlags, slaState, type BusinessHours, type SlaConfig } from "../rules";

// México centro (UTC-6, sin horario de verano): 09:00 local = 15:00Z.
const MX: BusinessHours = { timezone: "America/Mexico_City", startHour: 9, endHour: 18, days: [1, 2, 3, 4, 5] };
const iso = (s: string) => new Date(s);

describe("addBusinessMinutes", () => {
  it("sin horario cuenta corrido", () => {
    expect(addBusinessMinutes(iso("2026-11-05T10:00:00Z"), 90, null).toISOString()).toBe("2026-11-05T11:30:00.000Z");
  });

  it("dentro del horario suma directo", () => {
    // jueves 10:00 local + 60 min = 11:00 local
    expect(addBusinessMinutes(iso("2026-11-05T16:00:00Z"), 60, MX).toISOString()).toBe("2026-11-05T17:00:00.000Z");
  });

  it("lo que no cabe pasa al siguiente día hábil", () => {
    // jueves 17:30 local + 60 min → 30 min hoy y 30 mañana viernes: 09:30 local
    expect(addBusinessMinutes(iso("2026-11-05T23:30:00Z"), 60, MX).toISOString()).toBe("2026-11-06T15:30:00.000Z");
  });

  it("salta el fin de semana", () => {
    // viernes 17:00 local + 120 min → 60 hoy, 60 el lunes: lunes 10:00 local
    expect(addBusinessMinutes(iso("2026-11-06T23:00:00Z"), 120, MX).toISOString()).toBe("2026-11-09T16:00:00.000Z");
  });

  it("empezar fuera de horario arranca al abrir", () => {
    // sábado 12:00 local + 30 min → lunes 09:30
    expect(addBusinessMinutes(iso("2026-11-07T18:00:00Z"), 30, MX).toISOString()).toBe("2026-11-09T15:30:00.000Z");
  });

  it("respeta minutos y segundos sueltos", () => {
    expect(addBusinessMinutes(iso("2026-11-05T16:12:30Z"), 5, MX).toISOString()).toBe("2026-11-05T16:17:30.000Z");
  });

  it("un horario inválido no entra en bucle", () => {
    expect(addBusinessMinutes(iso("2026-11-05T10:00:00Z"), 10, { ...MX, startHour: 18, endHour: 9 }).toISOString()).toBe("2026-11-05T10:10:00.000Z");
  });
});

const CONFIG: SlaConfig = { enabledAt: iso("2026-11-01T00:00:00Z"), responseMinutes: 60, resolutionHours: 8, businessHoursOnly: false };
const chat = (over: Partial<Parameters<typeof slaState>[0]> = {}) => ({
  status: "OPEN",
  snoozedUntil: null,
  waitingSince: null,
  openedAt: null,
  createdAt: iso("2026-11-05T08:00:00Z"),
  ...over,
});

describe("slaState", () => {
  const now = iso("2026-11-05T12:00:00Z");

  it("apagado o no abierto: sin relojes", () => {
    expect(slaState(chat(), { ...CONFIG, enabledAt: null }, null, now)).toEqual({ response: null, resolution: null });
    expect(slaState(chat({ status: "PENDING" }), CONFIG, null, now).resolution).toBeNull();
    expect(slaState(chat({ status: "RESOLVED" }), CONFIG, null, now).resolution).toBeNull();
  });

  it("pospuesto no vence; con la posposición vencida sí", () => {
    expect(slaState(chat({ snoozedUntil: iso("2026-11-05T13:00:00Z") }), CONFIG, null, now).resolution).toBeNull();
    expect(slaState(chat({ snoozedUntil: iso("2026-11-05T11:00:00Z") }), CONFIG, null, now).resolution).not.toBeNull();
  });

  it("respuesta vencida tras N minutos de espera", () => {
    expect(slaState(chat({ waitingSince: iso("2026-11-05T11:30:00Z") }), CONFIG, null, now).response?.breached).toBe(false);
    const s = slaState(chat({ waitingSince: iso("2026-11-05T11:00:00Z") }), CONFIG, null, now);
    expect(s.response).toMatchObject({ breached: true, dueAt: iso("2026-11-05T12:00:00Z") });
  });

  it("resolución desde openedAt si se reabrió", () => {
    expect(slaState(chat(), CONFIG, null, iso("2026-11-05T16:00:00Z")).resolution?.breached).toBe(true);
    expect(slaState(chat({ openedAt: iso("2026-11-05T10:00:00Z") }), CONFIG, null, iso("2026-11-05T16:00:00Z")).resolution?.breached).toBe(false);
  });

  it("no cuenta tiempo antes de encender el SLA", () => {
    const enabledAt = iso("2026-11-05T11:30:00Z");
    const s = slaState(chat({ waitingSince: iso("2026-11-01T00:00:00Z") }), { ...CONFIG, enabledAt }, null, now);
    expect(s.response).toMatchObject({ startedAt: enabledAt, breached: false });
    expect(s.resolution?.startedAt).toEqual(enabledAt);
  });

  it("con horario laboral aplica el horario", () => {
    // jueves 17:30 local espera; a las 18:30 local sin horario ya venció, con horario no.
    const waiting = chat({ waitingSince: iso("2026-11-05T23:30:00Z") });
    const at = iso("2026-11-06T00:30:00Z");
    expect(slaState(waiting, CONFIG, MX, at).response?.breached).toBe(true);
    expect(slaState(waiting, { ...CONFIG, businessHoursOnly: true }, MX, at).response?.breached).toBe(false);
  });
});

describe("slaBreachFlags", () => {
  const base = { ...chat({ waitingSince: iso("2026-11-05T11:00:00Z") }), slaResponseBreachedFor: null, slaResolutionBreachedFor: null };

  it("vencido solo si el aviso corresponde al reloj actual", () => {
    expect(slaBreachFlags({ ...base, slaResponseBreachedFor: iso("2026-11-05T11:00:00Z") }).responseBreached).toBe(true);
    // Contestaron y el cliente volvió a escribir: espera nueva, aviso viejo.
    expect(slaBreachFlags({ ...base, slaResponseBreachedFor: iso("2026-11-05T09:00:00Z") }).responseBreached).toBe(false);
    expect(slaBreachFlags({ ...base, waitingSince: null, slaResponseBreachedFor: iso("2026-11-05T11:00:00Z") }).responseBreached).toBe(false);
  });

  it("resolución: no cuenta si se resolvió o empezó otro ciclo", () => {
    const z = { ...base, slaResolutionBreachedFor: iso("2026-11-05T08:00:00Z") };
    expect(slaBreachFlags(z).resolutionBreached).toBe(true);
    expect(slaBreachFlags({ ...z, status: "RESOLVED" }).resolutionBreached).toBe(false);
    expect(slaBreachFlags({ ...z, openedAt: iso("2026-11-05T10:00:00Z") }).resolutionBreached).toBe(false);
  });
});

it("formatSlaMinutes", () => {
  expect(formatSlaMinutes(45)).toBe("45 min");
  expect(formatSlaMinutes(180)).toBe("3 h");
  expect(formatSlaMinutes(90)).toBe("1 h 30 min");
});
