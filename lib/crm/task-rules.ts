// Reglas PURAS de tareas y de la línea de tiempo (sin base de datos, con
// pruebas): límites de día en la zona de la organización, recordatorios,
// plan de la tarea que crea una etapa y mezcla paginada de varias fuentes.

// ── Días en la zona horaria de la organización ──────────────────────────────

// Desfase (ms) de la zona respecto a UTC en ese instante.
function tzOffsetMs(at: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(at));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(at / 1000) * 1000;
}

// Instante UTC de las 00:00 locales de ese día (año/mes/día locales).
function zonedMidnight(y: number, m: number, d: number, timeZone: string): number {
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - tzOffsetMs(guess, timeZone);
  // Un cambio de horario entre el cálculo y el resultado se corrige una vez.
  const again = guess - tzOffsetMs(t, timeZone);
  if (again !== t) t = again;
  return t;
}

// Inicio (00:00 local) del día "YYYY-MM-DD" en la zona de la organización.
export function localDayStart(date: string, timeZone: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return new Date(zonedMidnight(y, mo, d, safeTimeZone(timeZone)));
}

export function safeTimeZone(tz: string | null | undefined): string {
  if (!tz) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

// [start, end) del día local de `now`. Un día con cambio de horario mide 23 o 25 h.
export function dayBounds(now: Date, timeZone: string): { start: Date; end: Date } {
  const tz = safeTimeZone(timeZone);
  const local = new Date(now.getTime() + tzOffsetMs(now.getTime(), tz));
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth() + 1;
  const d = local.getUTCDate();
  const start = zonedMidnight(y, m, d, tz);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const end = zonedMidnight(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), tz);
  return { start: new Date(start), end: new Date(end) };
}

// ── Recordatorios ───────────────────────────────────────────────────────────

export const MAX_REMIND_MINUTES = 10_080; // 7 días

// Cuándo avisar: `dueAt − anticipación`. Sin fecha, sin anticipación o con el
// aviso ya en el pasado no se programa nada (quien crea una tarea atrasada ya
// sabe que lo está).
export function computeRemindAt(dueAt: Date | null, minutesBefore: number | null, now: Date): Date | null {
  if (!dueAt || minutesBefore === null) return null;
  const at = new Date(dueAt.getTime() - minutesBefore * 60_000);
  return at.getTime() > now.getTime() ? at : null;
}

// ── Clasificación para "Mi día" ─────────────────────────────────────────────

export type TaskBucket = "overdue" | "today" | "upcoming" | "undated";

export function taskBucket(dueAt: Date | null, bounds: { start: Date; end: Date }): TaskBucket {
  if (!dueAt) return "undated";
  if (dueAt < bounds.start) return "overdue";
  if (dueAt < bounds.end) return "today";
  return "upcoming";
}

// ── Tarea que crea una etapa ────────────────────────────────────────────────

export const MAX_AUTO_TASK_DAYS = 365;

export interface StageTaskRule {
  autoTaskTitle: string | null;
  autoTaskDueDays: number | null;
}

// `autoKey` identifica ESTA entrada a la etapa: reintentar el mismo cambio no
// duplica la tarea, volver a entrar a la etapa más tarde sí crea otra.
export function planStageTask(
  stageId: string,
  rule: StageTaskRule,
  enteredAt: Date
): { title: string; dueAt: Date; autoKey: string } | null {
  const title = rule.autoTaskTitle?.trim();
  if (!title) return null;
  const days = Math.min(Math.max(rule.autoTaskDueDays ?? 0, 0), MAX_AUTO_TASK_DAYS);
  return {
    title: title.slice(0, 200),
    dueAt: new Date(enteredAt.getTime() + days * 86_400_000),
    autoKey: `stage:${stageId}:${enteredAt.getTime()}`,
  };
}

// ── Mezcla paginada de fuentes (línea de tiempo) ────────────────────────────

// Cada fuente (actividad, mensajes, notas, citas…) se pagina con su propia
// posición (fecha, id), de modo que mezclar sin perder ni repetir elementos no
// depende de que los ids de distintas tablas sean comparables.

export interface TimelineEntry {
  key: string; // "<fuente>:<id>", único
  source: string;
  id: string;
  at: Date;
}

export type SourcePosition = { t: string; i: string };
export type MergeCursor = Record<string, SourcePosition>;

function compareDesc(a: TimelineEntry, b: TimelineEntry): number {
  const d = b.at.getTime() - a.at.getTime();
  if (d !== 0) return d;
  return a.key < b.key ? 1 : a.key > b.key ? -1 : 0;
}

// `lists` trae, por fuente, hasta `take + 1` elementos ordenados de más nuevo a
// más viejo (el +1 sirve solo para saber si hay más).
export function mergeTimeline<T extends TimelineEntry>(
  lists: Record<string, T[]>,
  take: number,
  prev: MergeCursor = {}
): { items: T[]; nextCursor: MergeCursor | null } {
  const heads = Object.fromEntries(Object.keys(lists).map((k) => [k, 0]));
  const items: T[] = [];
  const next: MergeCursor = { ...prev };
  while (items.length < take) {
    let best: string | null = null;
    for (const src of Object.keys(lists)) {
      const cand = lists[src][heads[src]];
      if (!cand) continue;
      if (best === null || compareDesc(cand, lists[best][heads[best]]) < 0) best = src;
    }
    if (best === null) break;
    const e = lists[best][heads[best]++];
    items.push(e);
    next[best] = { t: e.at.toISOString(), i: e.id };
  }
  const more = Object.keys(lists).some((src) => heads[src] < lists[src].length);
  return { items, nextCursor: more ? next : null };
}

export function encodeMergeCursor(c: MergeCursor): string {
  return Buffer.from(JSON.stringify(c)).toString("base64url");
}

export function decodeMergeCursor(raw: string | null | undefined): MergeCursor {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: MergeCursor = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const pos = v as { t?: unknown; i?: unknown };
      if (typeof pos?.t === "string" && typeof pos?.i === "string" && !Number.isNaN(Date.parse(pos.t))) out[k] = { t: pos.t, i: pos.i };
    }
    return out;
  } catch {
    return {};
  }
}
