import { describe, expect, it } from "vitest";
import {
  computeRemindAt,
  dayBounds,
  decodeMergeCursor,
  encodeMergeCursor,
  mergeTimeline,
  planStageTask,
  safeTimeZone,
  taskBucket,
  type TimelineEntry,
} from "../task-rules";

const d = (iso: string) => new Date(iso);

describe("dayBounds", () => {
  it("usa el día local de la organización, no el de UTC", () => {
    // 2026-10-06 02:30 UTC = 2026-10-05 20:30 en Ciudad de México (UTC−6, sin horario de verano).
    const { start, end } = dayBounds(d("2026-10-06T02:30:00Z"), "America/Mexico_City");
    expect(start.toISOString()).toBe("2026-10-05T06:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-06T06:00:00.000Z");
  });

  it("el inicio del día pertenece al día y el final no", () => {
    const b = dayBounds(d("2026-10-05T06:00:00Z"), "America/Mexico_City");
    expect(b.start.toISOString()).toBe("2026-10-05T06:00:00.000Z");
    const prev = dayBounds(d("2026-10-05T05:59:59Z"), "America/Mexico_City");
    expect(prev.end.toISOString()).toBe("2026-10-05T06:00:00.000Z");
  });

  it("un día con cambio de horario mide 23 o 25 horas", () => {
    // Madrid: el 2026-03-29 se adelanta el reloj (23 h) y el 2026-10-25 se atrasa (25 h).
    const spring = dayBounds(d("2026-03-29T12:00:00Z"), "Europe/Madrid");
    expect((spring.end.getTime() - spring.start.getTime()) / 3_600_000).toBe(23);
    const autumn = dayBounds(d("2026-10-25T12:00:00Z"), "Europe/Madrid");
    expect((autumn.end.getTime() - autumn.start.getTime()) / 3_600_000).toBe(25);
  });

  it("una zona inválida cae a UTC en vez de lanzar", () => {
    expect(safeTimeZone("No/Existe")).toBe("UTC");
    const b = dayBounds(d("2026-10-06T10:00:00Z"), "No/Existe");
    expect(b.start.toISOString()).toBe("2026-10-06T00:00:00.000Z");
  });
});

describe("recordatorios", () => {
  const now = d("2026-10-06T12:00:00Z");

  it("avisa dueAt menos la anticipación", () => {
    expect(computeRemindAt(d("2026-10-06T15:00:00Z"), 60, now)?.toISOString()).toBe("2026-10-06T14:00:00.000Z");
    expect(computeRemindAt(d("2026-10-06T15:00:00Z"), 0, now)?.toISOString()).toBe("2026-10-06T15:00:00.000Z");
  });

  it("no programa avisos sin fecha, sin anticipación o ya vencidos", () => {
    expect(computeRemindAt(null, 0, now)).toBeNull();
    expect(computeRemindAt(d("2026-10-06T15:00:00Z"), null, now)).toBeNull();
    expect(computeRemindAt(d("2026-10-06T12:30:00Z"), 60, now)).toBeNull();
    expect(computeRemindAt(d("2026-10-06T12:00:00Z"), 0, now)).toBeNull();
  });
});

describe("taskBucket", () => {
  const bounds = dayBounds(d("2026-10-06T18:00:00Z"), "America/Mexico_City");
  it("separa atrasadas, de hoy, próximas y sin fecha", () => {
    expect(taskBucket(null, bounds)).toBe("undated");
    expect(taskBucket(d("2026-10-05T10:00:00Z"), bounds)).toBe("overdue");
    expect(taskBucket(d("2026-10-06T10:00:00Z"), bounds)).toBe("today");
    expect(taskBucket(d("2026-10-07T10:00:00Z"), bounds)).toBe("upcoming");
  });
  it("el límite exacto del final del día ya es de mañana", () => {
    expect(taskBucket(bounds.end, bounds)).toBe("upcoming");
    expect(taskBucket(bounds.start, bounds)).toBe("today");
  });
});

describe("planStageTask", () => {
  const at = d("2026-10-06T12:00:00Z");
  it("sin título no hay tarea", () => {
    expect(planStageTask("s1", { autoTaskTitle: null, autoTaskDueDays: 3 }, at)).toBeNull();
    expect(planStageTask("s1", { autoTaskTitle: "   ", autoTaskDueDays: 3 }, at)).toBeNull();
  });
  it("calcula el plazo en días desde la entrada", () => {
    const p = planStageTask("s1", { autoTaskTitle: " Llamar ", autoTaskDueDays: 7 }, at)!;
    expect(p.title).toBe("Llamar");
    expect(p.dueAt.toISOString()).toBe("2026-10-13T12:00:00.000Z");
    expect(planStageTask("s1", { autoTaskTitle: "x", autoTaskDueDays: null }, at)!.dueAt.getTime()).toBe(at.getTime());
  });
  it("acota el plazo y la clave distingue cada entrada a la etapa", () => {
    expect(planStageTask("s1", { autoTaskTitle: "x", autoTaskDueDays: 99999 }, at)!.dueAt.getTime()).toBe(at.getTime() + 365 * 86_400_000);
    expect(planStageTask("s1", { autoTaskTitle: "x", autoTaskDueDays: -5 }, at)!.dueAt.getTime()).toBe(at.getTime());
    const a = planStageTask("s1", { autoTaskTitle: "x", autoTaskDueDays: 0 }, at)!.autoKey;
    const b = planStageTask("s1", { autoTaskTitle: "x", autoTaskDueDays: 0 }, at)!.autoKey;
    const c = planStageTask("s1", { autoTaskTitle: "x", autoTaskDueDays: 0 }, d("2026-10-07T12:00:00Z"))!.autoKey;
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

function entry(source: string, id: string, iso: string): TimelineEntry {
  return { key: `${source}:${id}`, source, id, at: d(iso) };
}

describe("mergeTimeline", () => {
  const lists = () => ({
    activity: [entry("activity", "a3", "2026-10-06T10:00:00Z"), entry("activity", "a2", "2026-10-04T10:00:00Z"), entry("activity", "a1", "2026-10-01T10:00:00Z")],
    message: [entry("message", "m2", "2026-10-05T10:00:00Z"), entry("message", "m1", "2026-10-03T10:00:00Z")],
  });

  it("ordena de más nuevo a más viejo mezclando fuentes", () => {
    const { items } = mergeTimeline(lists(), 10);
    expect(items.map((i) => i.key)).toEqual(["activity:a3", "message:m2", "activity:a2", "message:m1", "activity:a1"]);
  });

  it("recorta a `take`, devuelve el cursor de cada fuente y avisa si hay más", () => {
    const first = mergeTimeline(lists(), 3);
    expect(first.items.map((i) => i.key)).toEqual(["activity:a3", "message:m2", "activity:a2"]);
    expect(first.nextCursor).toEqual({ activity: { t: "2026-10-04T10:00:00.000Z", i: "a2" }, message: { t: "2026-10-05T10:00:00.000Z", i: "m2" } });
  });

  it("sin más elementos no hay cursor", () => {
    expect(mergeTimeline(lists(), 5).nextCursor).toBeNull();
    expect(mergeTimeline({ a: [], b: [] }, 5)).toEqual({ items: [], nextCursor: null });
  });

  it("paginar página por página recorre todo sin repetir ni perder", () => {
    const all = [
      ...Array.from({ length: 7 }, (_, i) => entry("activity", `a${i}`, `2026-10-0${7 - i}T10:00:00Z`)),
      ...Array.from({ length: 6 }, (_, i) => entry("message", `m${i}`, `2026-10-0${7 - i}T11:00:00Z`)),
    ];
    const take = 4;
    const seen: string[] = [];
    let cursor = decodeMergeCursor(null);
    for (let guard = 0; guard < 10; guard++) {
      // Simula las consultas por fuente: posteriores al cursor, take + 1.
      const bySource: Record<string, TimelineEntry[]> = { activity: [], message: [] };
      for (const src of Object.keys(bySource)) {
        const pos = cursor[src];
        bySource[src] = all
          .filter((e) => e.source === src)
          .filter((e) => !pos || e.at < new Date(pos.t) || (e.at.getTime() === new Date(pos.t).getTime() && e.id < pos.i))
          .sort((x, y) => y.at.getTime() - x.at.getTime() || (x.id < y.id ? 1 : -1))
          .slice(0, take + 1);
      }
      const page = mergeTimeline(bySource, take, cursor);
      seen.push(...page.items.map((i) => i.key));
      if (!page.nextCursor) break;
      cursor = decodeMergeCursor(encodeMergeCursor(page.nextCursor));
    }
    expect(seen).toHaveLength(13);
    expect(new Set(seen).size).toBe(13);
  });

  it("el desempate con la misma fecha es estable", () => {
    const a = mergeTimeline({ x: [entry("x", "1", "2026-10-06T10:00:00Z")], y: [entry("y", "1", "2026-10-06T10:00:00Z")] }, 2).items.map((i) => i.key);
    const b = mergeTimeline({ y: [entry("y", "1", "2026-10-06T10:00:00Z")], x: [entry("x", "1", "2026-10-06T10:00:00Z")] }, 2).items.map((i) => i.key);
    expect(a).toEqual(b);
  });
});

describe("cursor", () => {
  it("ida y vuelta", () => {
    const c = { activity: { t: "2026-10-04T10:00:00.000Z", i: "a2" } };
    expect(decodeMergeCursor(encodeMergeCursor(c))).toEqual(c);
  });
  it("un cursor manipulado se ignora en vez de romper", () => {
    expect(decodeMergeCursor("%%%")).toEqual({});
    expect(decodeMergeCursor(Buffer.from('{"a":{"t":"no-es-fecha","i":"x"}}').toString("base64url"))).toEqual({});
    expect(decodeMergeCursor(Buffer.from("[1,2]").toString("base64url"))).toEqual({});
  });
});
