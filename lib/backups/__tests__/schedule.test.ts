import { describe, it, expect } from "vitest";
import { currentBackupSlot, decideBackup, isStaleRun, BACKUP_RETRY_DELAY_MS, type BackupRunLite } from "../schedule";

const MX = "America/Mexico_City"; // UTC-6 todo el año
const iso = (s: string) => new Date(s);

describe("currentBackupSlot", () => {
  it("antes de la hora, el horario vigente es el de ayer", () => {
    // 02:00 en CDMX = 08:00 UTC; el de las 03:00 de ayer = 09:00 UTC del día anterior
    expect(currentBackupSlot(iso("2026-10-04T08:00:00Z"), 3, MX).toISOString()).toBe("2026-10-03T09:00:00.000Z");
  });
  it("después de la hora, es el de hoy", () => {
    expect(currentBackupSlot(iso("2026-10-04T10:00:00Z"), 3, MX).toISOString()).toBe("2026-10-04T09:00:00.000Z");
  });
  it("justo a la hora ya cuenta", () => {
    expect(currentBackupSlot(iso("2026-10-04T09:00:00Z"), 3, MX).toISOString()).toBe("2026-10-04T09:00:00.000Z");
  });
  it("usa el día LOCAL, no el de UTC (21:00 en CDMX ya es mañana en UTC)", () => {
    // 2026-10-05T03:00Z = 2026-10-04 21:00 CDMX → el horario de las 20:00 del día local 4 es 2026-10-05T02:00Z
    expect(currentBackupSlot(iso("2026-10-05T03:00:00Z"), 20, MX).toISOString()).toBe("2026-10-05T02:00:00.000Z");
  });
  it("maneja zonas con horario de verano", () => {
    // Nueva York en julio es UTC-4
    expect(currentBackupSlot(iso("2026-07-10T12:00:00Z"), 3, "America/New_York").toISOString()).toBe("2026-07-10T07:00:00.000Z");
    // y en enero UTC-5
    expect(currentBackupSlot(iso("2026-01-10T12:00:00Z"), 3, "America/New_York").toISOString()).toBe("2026-01-10T08:00:00.000Z");
  });
});

const run = (status: BackupRunLite["status"], startedAt: string, trigger: BackupRunLite["trigger"] = "SCHEDULED"): BackupRunLite => ({
  status,
  trigger,
  startedAt: iso(startedAt),
});

describe("decideBackup", () => {
  const now = iso("2026-10-04T10:00:00Z"); // 04:00 CDMX; horario vigente: 03:00 = 09:00Z
  const opts = { now, hour: 3, timeZone: MX };

  it("sin corridas toca (primer respaldo inmediato al activar)", () => {
    expect(decideBackup({ ...opts, runs: [] })).toMatchObject({ due: true, attempt: 1 });
  });
  it("si ya hubo uno exitoso en este horario, no", () => {
    expect(decideBackup({ ...opts, runs: [run("SUCCESS", "2026-10-04T09:01:00Z")] })).toMatchObject({ due: false, reason: "done" });
  });
  it("el éxito de AYER no cuenta para hoy", () => {
    expect(decideBackup({ ...opts, runs: [run("SUCCESS", "2026-10-03T09:01:00Z")] })).toMatchObject({ due: true });
  });
  it("uno manual no sustituye al programado", () => {
    expect(decideBackup({ ...opts, runs: [run("SUCCESS", "2026-10-04T09:30:00Z", "MANUAL")] })).toMatchObject({ due: true });
  });
  it("si hay uno en curso, espera", () => {
    expect(decideBackup({ ...opts, runs: [run("RUNNING", "2026-10-04T09:50:00Z")] })).toMatchObject({ due: false, reason: "running" });
  });
  it("tras un fallo reintenta solo pasada la espera", () => {
    const failedAt = new Date(now.getTime() - BACKUP_RETRY_DELAY_MS + 60_000).toISOString();
    expect(decideBackup({ ...opts, runs: [run("FAILED", failedAt)] })).toMatchObject({ due: false, reason: "retry_wait" });
    // Misma noche, 70 min después del fallo (el fallo cae dentro del horario de las 03:00).
    expect(decideBackup({ ...opts, now: iso("2026-10-04T10:30:00Z"), runs: [run("FAILED", "2026-10-04T09:20:00Z")] })).toMatchObject({ due: true, attempt: 2 });
  });
  it("se rinde tras 3 fallos en el mismo horario", () => {
    const runs = [run("FAILED", "2026-10-04T09:00:30Z"), run("FAILED", "2026-10-04T09:05:00Z"), run("FAILED", "2026-10-04T09:10:00Z")];
    expect(decideBackup({ ...opts, now: iso("2026-10-04T15:00:00Z"), runs })).toMatchObject({ due: false, reason: "gave_up" });
  });
  it("al llegar el horario siguiente se vuelve a intentar", () => {
    const runs = [run("FAILED", "2026-10-04T09:00:30Z"), run("FAILED", "2026-10-04T09:05:00Z"), run("FAILED", "2026-10-04T09:10:00Z")];
    expect(decideBackup({ ...opts, now: iso("2026-10-05T09:30:00Z"), runs })).toMatchObject({ due: true, attempt: 1 });
  });
});

describe("isStaleRun", () => {
  it("más de 3 h en curso se da por abandonado", () => {
    const now = iso("2026-10-04T12:00:00Z");
    expect(isStaleRun(iso("2026-10-04T08:59:00Z"), now)).toBe(true);
    expect(isStaleRun(iso("2026-10-04T09:30:00Z"), now)).toBe(false);
  });
});
