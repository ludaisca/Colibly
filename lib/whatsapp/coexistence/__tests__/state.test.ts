import { describe, expect, it } from "vitest";
import { lifecycleActionFor, nextSyncAction, syncAfterHistory, tokenAlertFor } from "../state";

const NOW = new Date("2026-10-03T12:00:00Z");
const h = (n: number) => new Date(NOW.getTime() + n * 3_600_000);
const d = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

describe("nextSyncAction", () => {
  it("recién conectada: primero contactos", () => expect(nextSyncAction("PENDING", h(23), NOW)).toBe("contacts"));
  it("contactos pedidos: sigue el historial", () => expect(nextSyncAction("CONTACTS_REQUESTED", h(5), NOW)).toBe("history"));
  it("pasadas las 24 h sin pedirlo: vence", () => {
    expect(nextSyncAction("PENDING", h(-1), NOW)).toBe("expire");
    expect(nextSyncAction("CONTACTS_REQUESTED", h(-0.01), NOW)).toBe("expire");
  });
  it("historial ya pedido o estado final: nada que hacer, aunque pase el límite", () => {
    for (const s of ["HISTORY_REQUESTED", "COMPLETED", "HISTORY_DECLINED", "EXPIRED", "FAILED", "NONE"] as const) {
      expect(nextSyncAction(s, h(-100), NOW)).toBe("none");
    }
  });
  it("sin límite registrado no vence", () => expect(nextSyncAction("PENDING", null, NOW)).toBe("contacts"));
});

describe("syncAfterHistory", () => {
  const cur = { status: "HISTORY_REQUESTED" as const, progress: 20 };
  it("avance parcial sube el progreso y nunca lo baja", () => {
    expect(syncAfterHistory(cur, { kind: "chunk", phase: 0, chunkOrder: 1, progress: 55, messages: [] })).toEqual({ status: "HISTORY_REQUESTED", progress: 55, error: null });
    expect(syncAfterHistory({ ...cur, progress: 80 }, { kind: "chunk", phase: 0, chunkOrder: 1, progress: 55, messages: [] }).progress).toBe(80);
  });
  it("progreso 100 completa", () => expect(syncAfterHistory(cur, { kind: "chunk", phase: 2, chunkOrder: 9, progress: 100, messages: [] })).toMatchObject({ status: "COMPLETED", progress: 100 }));
  it("historial rechazado", () => expect(syncAfterHistory(cur, { kind: "declined" }).status).toBe("HISTORY_DECLINED"));
  it("error se guarda sin cambiar el estado", () => expect(syncAfterHistory(cur, { kind: "error", code: 1, message: "falló" })).toEqual({ status: "HISTORY_REQUESTED", progress: 20, error: "falló" }));
  it("un estado final no retrocede", () => {
    expect(syncAfterHistory({ status: "COMPLETED", progress: 100 }, { kind: "declined" }).status).toBe("COMPLETED");
    expect(syncAfterHistory({ status: "EXPIRED", progress: null }, { kind: "chunk", phase: 0, chunkOrder: 1, progress: 100, messages: [] }).status).toBe("EXPIRED");
  });
});

describe("tokenAlertFor", () => {
  it("sin vencimiento conocido: nada", () => expect(tokenAlertFor(NOW, null, null)).toBe("none"));
  it("lejos del vencimiento: nada", () => expect(tokenAlertFor(NOW, d(30), null)).toBe("none"));
  it("dentro de 10 días y sin aviso previo: soon", () => expect(tokenAlertFor(NOW, d(9), null)).toBe("soon"));
  it("ya avisado hace poco: no repite", () => expect(tokenAlertFor(NOW, d(9), d(-1))).toBe("none"));
  it("ya avisado hace más de 3 días: repite", () => expect(tokenAlertFor(NOW, d(5), d(-4))).toBe("soon"));
  it("vencido y sin aviso de vencimiento: expired", () => expect(tokenAlertFor(NOW, d(-1), d(-6))).toBe("expired"));
  it("vencido y ya avisado después del vencimiento: nada", () => expect(tokenAlertFor(NOW, d(-2), d(-1))).toBe("none"));
});

describe("lifecycleActionFor", () => {
  it("PARTNER_REMOVED con motivo conocido", () => {
    const a = lifecycleActionFor({ event: "PARTNER_REMOVED", disconnection_info: { reason: "ACCOUNT_DISCONNECTED", initiated_by: "USER" } });
    expect(a).toMatchObject({ kind: "disconnect", reason: "ACCOUNT_DISCONNECTED" });
    expect(a.kind === "disconnect" && a.detail).toContain("desconectó Colibly");
  });
  it("iniciada por el sistema se aclara", () => {
    const a = lifecycleActionFor({ event: "PARTNER_REMOVED", disconnection_info: { reason: "PRIMARY_INACTIVITY", initiated_by: "SYSTEM" } });
    expect(a.kind === "disconnect" && a.detail).toContain("iniciada por WhatsApp");
  });
  it("motivo desconocido o ausente", () => {
    expect(lifecycleActionFor({ event: "PARTNER_REMOVED" })).toMatchObject({ kind: "disconnect", reason: "UNKNOWN" });
    const a = lifecycleActionFor({ event: "PARTNER_REMOVED", disconnection_info: { reason: "NUEVO" } });
    expect(a.kind === "disconnect" && a.detail).toContain("NUEVO");
  });
  it("cambio de teléfono y reconexión", () => {
    expect(lifecycleActionFor({ event: "ACCOUNT_OFFBOARDED" })).toEqual({ kind: "offboarded" });
    expect(lifecycleActionFor({ event: "ACCOUNT_RECONNECTED" })).toEqual({ kind: "reconnected" });
  });
  it("otros eventos (restricciones, etc.) no son de ciclo de vida", () => {
    expect(lifecycleActionFor({ event: "DISABLED_UPDATE" })).toEqual({ kind: "none" });
    expect(lifecycleActionFor(null)).toEqual({ kind: "none" });
  });
});
