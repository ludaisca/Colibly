import { describe, expect, it } from "vitest";
import { isReply, responseSamples, summarizeResponses, type ResponseMessage } from "../response-rules";

const T0 = new Date("2026-11-10T15:00:00Z").getTime();
const at = (minutes: number) => new Date(T0 + minutes * 60_000);
const since = at(-14 * 24 * 60);
const inbound = (min: number, extra: Partial<ResponseMessage> = {}): ResponseMessage => ({ at: at(min), inbound: true, ...extra });
const outbound = (min: number, extra: Partial<ResponseMessage> = {}): ResponseMessage => ({ at: at(min), inbound: false, sentVia: "agent", senderId: "u1", ...extra });

describe("isReply", () => {
  it("persona, bot y app cuentan; campaña, secuencia, recuperación, aviso e historial no", () => {
    expect(isReply(outbound(0))).toBe(true);
    expect(isReply(outbound(0, { sentVia: "bot", senderId: null }))).toBe(true);
    expect(isReply(outbound(0, { sentVia: "business_app" }))).toBe(true);
    expect(isReply(outbound(0, { sentVia: null }))).toBe(true);
    expect(isReply(outbound(0, { sentVia: "campaign" }))).toBe(false);
    expect(isReply(outbound(0, { sentVia: null, campaign: true }))).toBe(false);
    for (const via of ["sequence", "recovery", "system", "history"]) expect(isReply(outbound(0, { sentVia: via }))).toBe(false);
    expect(isReply(outbound(0, { history: true }))).toBe(false);
  });
});

describe("responseSamples", () => {
  it("del primer entrante a la primera respuesta, en minutos", () => {
    const samples = responseSamples([inbound(0), inbound(1), outbound(3), inbound(5), outbound(6)], since);
    expect(samples).toEqual([{ startedAt: at(0), minutes: 3, responderId: "u1" }]);
  });

  it("una campaña previa no inicia la conversación ni cuenta como respuesta", () => {
    const samples = responseSamples([outbound(-60, { sentVia: "campaign" }), inbound(0), outbound(10, { sentVia: "bot", senderId: null })], since);
    expect(samples).toEqual([{ startedAt: at(0), minutes: 10, responderId: null }]);
  });

  it("sin respuesta no cuenta, ni siquiera cuando el cliente vuelve días después", () => {
    expect(responseSamples([inbound(0)], since)).toEqual([]);
    const samples = responseSamples([inbound(0), inbound(3 * 24 * 60), outbound(3 * 24 * 60 + 2)], since);
    expect(samples).toHaveLength(1);
    expect(samples[0].minutes).toBe(2);
  });

  it("solo campaña o aviso después del entrante: sin respuesta", () => {
    expect(responseSamples([inbound(0), outbound(5, { sentVia: "system" }), outbound(9, { sentVia: "recovery" })], since)).toEqual([]);
  });

  it("historial importado no inicia conversaciones", () => {
    expect(responseSamples([inbound(0, { history: true }), outbound(4000, { history: true })], since)).toEqual([]);
  });

  it("nueva conversación tras 24 h sin actividad; las anteriores al periodo no cuentan", () => {
    const msgs = [inbound(-20 * 24 * 60), outbound(-20 * 24 * 60 + 1), inbound(0), outbound(30), inbound(2 * 24 * 60), outbound(2 * 24 * 60 + 90)];
    expect(responseSamples(msgs, since).map((s) => s.minutes)).toEqual([30, 90]);
  });
});

describe("summarizeResponses", () => {
  it("la mediana no se dispara con un caso extremo; el promedio sí", () => {
    // Nueve respuestas rápidas y una de 4 días (5,760 min): el promedio da ~10 h.
    const summary = summarizeResponses([2, 3, 3, 4, 5, 5, 6, 8, 10, 5760]);
    expect(summary.medianMinutes).toBe(5);
    expect(summary.avgMinutes).toBe(580.6);
    expect(summary.count).toBe(10);
  });
  it("vacío", () => {
    expect(summarizeResponses([])).toEqual({ medianMinutes: null, avgMinutes: null, count: 0 });
  });
});
