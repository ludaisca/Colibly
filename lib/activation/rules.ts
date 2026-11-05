// Activación de una organización nueva: reglas puras (sin base ni red) para el
// embudo de /plataforma y los consejos por correo durante la prueba. Los sellos
// los pone lib/activation/tick.ts; aquí solo se interpretan.
//
// El orden de los pasos es el camino al primer valor: registrarse → confirmar
// el correo → conectar un canal → recibir el primer mensaje de un cliente →
// contestarlo (persona o bot) → automatizar → sumar al equipo → pagar.

/** Organizaciones que sigue el tick (y cohorte máxima del embudo). */
export const ACTIVATION_WINDOW_DAYS = 120;
/** Cohortes que ofrece la pestaña Activación de /plataforma. */
export const COHORT_DAYS = [7, 30, 90] as const;

export const ACTIVATION_STEPS = [
  "signup",
  "emailVerified",
  "channel",
  "firstInbound",
  "firstReply",
  "automation",
  "team",
  "paid",
] as const;

export type ActivationStep = (typeof ACTIVATION_STEPS)[number];

export const ACTIVATION_STEP_LABEL: Record<ActivationStep, string> = {
  signup: "Se registró",
  emailVerified: "Confirmó su correo",
  channel: "Conectó un canal",
  firstInbound: "Recibió un mensaje",
  firstReply: "Contestó un mensaje",
  automation: "Creó un bot o automatización",
  team: "Sumó a su equipo",
  paid: "Contrató",
};

/** Lo que falta, en infinitivo: "Falta conectar un canal". */
export const ACTIVATION_STEP_TODO: Record<ActivationStep, string> = {
  signup: "registrarse",
  emailVerified: "confirmar su correo",
  channel: "conectar un canal",
  firstInbound: "recibir el primer mensaje",
  firstReply: "contestar un mensaje",
  automation: "crear un bot o automatización",
  team: "sumar a su equipo",
  paid: "contratar",
};

export interface ActivationStamps {
  emailVerifiedAt: Date | null;
  channelAt: Date | null;
  firstInboundAt: Date | null;
  firstReplyAt: Date | null;
  automationAt: Date | null;
  teamAt: Date | null;
  paidAt: Date | null;
}

const STAMP_OF: Record<Exclude<ActivationStep, "signup">, keyof ActivationStamps> = {
  emailVerified: "emailVerifiedAt",
  channel: "channelAt",
  firstInbound: "firstInboundAt",
  firstReply: "firstReplyAt",
  automation: "automationAt",
  team: "teamAt",
  paid: "paidAt",
};

export function stepDoneAt(step: ActivationStep, signupAt: Date, stamps: ActivationStamps): Date | null {
  return step === "signup" ? signupAt : stamps[STAMP_OF[step]];
}

/** Primer paso que falta (dónde está atorada); null si completó todo. */
export function stuckAt(stamps: ActivationStamps): ActivationStep | null {
  for (const step of ACTIVATION_STEPS) {
    if (step === "signup") continue;
    if (!stamps[STAMP_OF[step]]) return step;
  }
  return null;
}

/** Pasos del camino principal (sin equipo ni pago) que ya cumplió, de 0 a 5. */
export function coreProgress(stamps: ActivationStamps): number {
  return (["emailVerified", "channel", "firstInbound", "firstReply", "automation"] as const).filter((s) => !!stamps[STAMP_OF[s]]).length;
}

export interface FunnelRow {
  step: ActivationStep;
  label: string;
  count: number;
  /** Porcentaje sobre los registros de la cohorte (0–100, entero). */
  pctOfSignups: number;
  /** Porcentaje sobre el paso anterior. */
  pctOfPrevious: number;
  /** Mediana de horas desde el registro hasta el paso (null si nadie llegó). */
  medianHours: number | null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/**
 * Embudo de una cohorte. Cada paso cuenta a quien lo cumplió, aunque se haya
 * saltado uno anterior (p. ej. contestar sin bot): así ningún paso "esconde" a
 * los que lo brincaron.
 */
export function buildFunnel(rows: Array<{ createdAt: Date; stamps: ActivationStamps }>): FunnelRow[] {
  const total = rows.length;
  let previous = total;
  return ACTIVATION_STEPS.map((step) => {
    const hours: number[] = [];
    for (const r of rows) {
      const at = stepDoneAt(step, r.createdAt, r.stamps);
      if (at) hours.push(Math.max(0, (at.getTime() - r.createdAt.getTime()) / 3_600_000));
    }
    const count = hours.length;
    const row: FunnelRow = {
      step,
      label: ACTIVATION_STEP_LABEL[step],
      count,
      pctOfSignups: pct(count, total),
      pctOfPrevious: pct(count, previous),
      medianHours: step === "signup" ? 0 : median(hours),
    };
    previous = count;
    return row;
  });
}

// ── Consejos por correo durante la prueba ───────────────────────────────────

export const NUDGE_KEYS = ["channel", "first_message", "automation", "team"] as const;
export type NudgeKey = (typeof NUDGE_KEYS)[number];

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Separación mínima entre dos consejos a la misma organización. */
export const NUDGE_MIN_GAP_HOURS = 48;

export interface NudgeInput {
  now: Date;
  createdAt: Date;
  status: string;
  isInternal: boolean;
  ownerVerified: boolean;
  optOut: boolean;
  trialDaysLeft: number | null;
  /** Días en que el tick de facturación ya manda "tu prueba termina en N días". */
  billingReminderDays: readonly number[];
  stamps: ActivationStamps;
  sent: readonly string[];
  lastNudgeAt: Date | null;
}

/**
 * El consejo que toca mandar ahora, o null. Uno a la vez, cada uno una sola
 * vez, con al menos 48 h entre dos, solo en prueba, solo al dueño con el
 * correo confirmado y sin baja, y nunca el día de un recordatorio de fin de
 * prueba (ese día ya recibe un correo).
 */
export function nextNudge(input: NudgeInput): NudgeKey | null {
  const { now, createdAt, stamps } = input;
  if (input.isInternal || input.status !== "TRIALING" || !input.ownerVerified || input.optOut) return null;
  if (input.trialDaysLeft !== null && (input.trialDaysLeft <= 0 || input.billingReminderDays.includes(input.trialDaysLeft))) return null;
  if (input.lastNudgeAt && now.getTime() - input.lastNudgeAt.getTime() < NUDGE_MIN_GAP_HOURS * HOUR) return null;

  const age = now.getTime() - createdAt.getTime();
  const since = (d: Date | null) => (d ? now.getTime() - d.getTime() : -1);
  const fresh = (k: NudgeKey) => !input.sent.includes(k);

  // Sin canal no pasa nada más: es el único consejo hasta que conecte.
  if (!stamps.channelAt) return age >= DAY && fresh("channel") ? "channel" : null;
  if (!stamps.firstInboundAt) return since(stamps.channelAt) >= DAY && fresh("first_message") ? "first_message" : null;
  if (!stamps.automationAt && age >= 3 * DAY && fresh("automation")) return "automation";
  if (!stamps.teamAt && stamps.firstReplyAt && age >= 5 * DAY && fresh("team")) return "team";
  return null;
}
