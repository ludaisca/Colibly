import { branchStart, GraphIndex, renderText, type RenderContext } from "./graph";
import { matchOption, normalize, numberedMenu, validateFreeReply } from "./match-reply";
import type { ConditionRule, Graph, Option, RunInput, RunState, Step, StepOf } from "./types";
import type { AutomationChannel } from "./validate";

// Ejecutor puro: avanza una ejecución desde `state` con un `input` hasta que
// se topa con una espera o el final. Nunca toca la base ni la red
// directamente — todo efecto pasa por `adapters`. Las ejecuciones reales usan
// adaptadores con Prisma (lib/automations/adapters.ts); los tests y el botón
// "Probar" del editor usan adaptadores falsos. Mismo código en los tres.

export const MAX_STEPS_PER_ADVANCE = 50;
const MAX_REPROMPTS = 2;

// ─── Adaptadores ────────────────────────────────────────────────────────────

export interface Facts {
  contact: { name: string | null; phone: string | null };
  customFields: Record<string, string | null>;
  tags: string[];
  leadStatus: string;
  scoreLabels: string[];
  channel: AutomationChannel;
}

export type OutgoingMessage =
  | { type: "text"; text: string }
  | { type: "buttons"; text: string; options: Option[] }
  | { type: "list"; text: string; buttonLabel: string; options: Option[] }
  | { type: "template"; templateId: string; bodyParams: string[]; headerParam: string | null; buttonParam: string | null };

// Error de envío clasificado — decide si la ejecución reintenta, expira o falla.
export class SendFailure extends Error {
  constructor(
    public readonly kind: "window_closed" | "retryable" | "permanent",
    message: string
  ) {
    super(message);
  }
}

export interface ExecutorAdapters {
  now(): Date;
  facts(): Promise<Facts>;
  lastInboundText(): Promise<string>;
  isBusinessHours(): Promise<boolean>;
  send(message: OutgoingMessage): Promise<void>;
  addTag(name: string): Promise<void>;
  removeTag(name: string): Promise<void>;
  setLeadStatus(status: string): Promise<void>;
  setCustomField(key: string, value: string): Promise<void>;
  assign(mode: "user" | "auto", userId: string | null): Promise<void>;
  /** Devuelve el nombre del equipo; lanza si ya no existe. */
  assignTeam(teamId: string): Promise<string>;
  notifyTeam(target: "assignee" | "user", userId: string | null, title: string, body: string): Promise<void>;
  // Devuelven null si no hay IA disponible (sin API key, presupuesto agotado).
  aiClassify(input: { instructions: string; categories: { id: string; label: string; description: string }[]; text: string }): Promise<string | null>;
  aiExtract(input: { what: string; format: string; text: string }): Promise<string | null>;
  aiMatchOption(options: Option[], text: string): Promise<string | null>;
  scoreLead(scorerId: string): Promise<void>;
  webhook(input: { url: string; method: "POST" | "GET"; body: string }): Promise<{ status: number; data: Record<string, unknown> | null }>;
  handToBot(): Promise<void>;
  handoff(input: { assign: "keep" | "auto" }): Promise<void>;
}

// ─── Resultado ──────────────────────────────────────────────────────────────

export type Outcome =
  | { status: "waiting_reply"; until: Date }
  | { status: "waiting_delay"; until: Date }
  | { status: "completed" }
  | { status: "handed_off" }
  | { status: "handed_to_bot" }
  | { status: "retry"; error: string } // state.nodeId sigue en el paso que falló
  | { status: "expired"; error: string }
  | { status: "failed"; error: string };

export interface LogEntry {
  nodeId: string | null;
  nodeType: string;
  outcome: "ok" | "branch" | "waiting" | "error" | "skipped";
  detail: string;
}

export interface ExecutionResult {
  state: RunState;
  outcome: Outcome;
  logs: LogEntry[];
}

// ─── Ejecución ──────────────────────────────────────────────────────────────

export async function execute(graph: Graph, initial: RunState, input: RunInput, adapters: ExecutorAdapters): Promise<ExecutionResult> {
  const idx = new GraphIndex(graph);
  const state: RunState = { nodeId: initial.nodeId, vars: { ...initial.vars }, waiting: initial.waiting ? { ...initial.waiting } : null };
  const logs: LogEntry[] = [];
  const log = (step: Step | null, outcome: LogEntry["outcome"], detail: string) =>
    logs.push({ nodeId: step?.id ?? null, nodeType: step?.type ?? "trigger", outcome, detail });

  let facts: Facts | null = null;
  const getFacts = async () => (facts ??= await adapters.facts());
  const invalidateFacts = () => {
    facts = null;
  };
  const render = async (text: string) => {
    const f = await getFacts();
    const ctx: RenderContext = { contact: f.contact, vars: state.vars, customFields: f.customFields };
    return renderText(text, ctx);
  };

  const done = (outcome: Outcome): ExecutionResult => ({ state, outcome, logs });

  // Envía y traduce un fallo de envío a un Outcome (o null si salió bien).
  const trySend = async (step: Step, message: OutgoingMessage, fallbackTemplateId?: string | null): Promise<Outcome | null> => {
    try {
      await adapters.send(message);
      return null;
    } catch (err) {
      if (!(err instanceof SendFailure)) throw err;
      if (err.kind === "window_closed" && fallbackTemplateId) {
        try {
          await adapters.send({ type: "template", templateId: fallbackTemplateId, bodyParams: [], headerParam: null, buttonParam: null });
          log(step, "ok", "Fuera de la ventana de 24 h: se envió la plantilla de respaldo");
          return null;
        } catch (inner) {
          if (!(inner instanceof SendFailure)) throw inner;
          err = inner;
        }
      }
      const failure = err as SendFailure;
      log(step, "error", failure.message);
      if (failure.kind === "window_closed") return { status: "expired", error: failure.message };
      if (failure.kind === "retryable") return { status: "retry", error: failure.message };
      return { status: "failed", error: failure.message };
    }
  };

  // ── 1. Resolver la espera pendiente con el input ──
  if (state.waiting) {
    const step = idx.get(state.waiting.nodeId);
    if (!step) return done({ status: "failed", error: "El paso en espera ya no existe en esta versión" });

    if (input.kind === "timeout") {
      state.waiting = null;
      state.nodeId = branchStart(step, "timeout");
      log(step, "branch", "Sin respuesta a tiempo");
    } else if (input.kind === "reply") {
      state.vars.respuesta = input.text;
      if (step.type === "send_buttons" || step.type === "send_list") {
        const resolved = await resolveOption(step, input, adapters);
        if (resolved) {
          state.waiting = null;
          state.vars.opcion = resolved.title;
          state.nodeId = branchStart(step, resolved.id);
          log(step, "branch", `Eligió “${resolved.title}”`);
        } else {
          const outcome = await handleUnmatched(step);
          if (outcome) return done(outcome);
        }
      } else if (step.type === "wait_for_reply") {
        const { ok, value } = validateFreeReply(input.text, step.config.validation);
        if (ok) {
          state.waiting = null;
          if (step.config.saveToVar) state.vars[step.config.saveToVar] = value;
          if (step.config.saveToCustomField) {
            await adapters.setCustomField(step.config.saveToCustomField, value);
            invalidateFacts();
          }
          state.nodeId = branchStart(step, "answered");
          log(step, "branch", `Respondió: ${value.slice(0, 120)}`);
        } else if (step.config.invalidMessage && state.waiting.reprompts < MAX_REPROMPTS) {
          state.waiting.reprompts++;
          const failed = await trySend(step, { type: "text", text: await render(step.config.invalidMessage) });
          if (failed) return done(failed);
          log(step, "waiting", "Respuesta inválida: se pidió de nuevo");
          return done({ status: "waiting_reply", until: addMinutes(adapters.now(), step.config.timeoutMinutes) });
        } else {
          state.waiting = null;
          state.nodeId = branchStart(step, "timeout");
          log(step, "branch", "Respuesta inválida: se toma la rama sin respuesta");
        }
      }
    } else {
      // start/resume con una espera de respuesta pendiente: nada que hacer.
      return done({ status: "waiting_reply", until: addMinutes(adapters.now(), 60) });
    }
  }

  // ── 2. Avanzar hasta una espera o el final ──
  for (let i = 0; i < MAX_STEPS_PER_ADVANCE; i++) {
    if (state.nodeId === null) return done({ status: "completed" });
    const step = idx.get(state.nodeId);
    if (!step) return done({ status: "failed", error: "El paso ya no existe en esta versión" });
    const next = idx.next(step.id);

    switch (step.type) {
      case "send_text": {
        const failed = await trySend(step, { type: "text", text: await render(step.config.text) }, step.config.fallbackTemplateId);
        if (failed) return done(failed);
        log(step, "ok", "Mensaje enviado");
        state.nodeId = next;
        break;
      }
      case "send_buttons":
      case "send_list": {
        const failed = await trySend(step, interactiveMessage(step, await render(step.config.text)));
        if (failed) return done(failed);
        state.waiting = { nodeId: step.id, kind: "options", reprompts: 0 };
        log(step, "waiting", "Opciones enviadas, esperando respuesta");
        return done({ status: "waiting_reply", until: addMinutes(adapters.now(), step.config.timeoutMinutes) });
      }
      case "send_template": {
        const params = await Promise.all(step.config.bodyParams.map((p) => render(p)));
        const failed = await trySend(step, {
          type: "template",
          templateId: step.config.templateId,
          bodyParams: params,
          headerParam: step.config.headerParam ? await render(step.config.headerParam) : null,
          buttonParam: step.config.buttonParam ? await render(step.config.buttonParam) : null,
        });
        if (failed) return done(failed);
        log(step, "ok", "Plantilla enviada");
        state.nodeId = next;
        break;
      }
      case "wait": {
        state.nodeId = next;
        if (next === null) {
          log(step, "skipped", "Espera al final: no hay nada después");
          return done({ status: "completed" });
        }
        log(step, "waiting", `Esperando ${formatMinutes(step.config.minutes)}`);
        return done({ status: "waiting_delay", until: addMinutes(adapters.now(), step.config.minutes) });
      }
      case "wait_for_reply": {
        state.waiting = { nodeId: step.id, kind: "free", reprompts: 0 };
        log(step, "waiting", "Esperando respuesta");
        return done({ status: "waiting_reply", until: addMinutes(adapters.now(), step.config.timeoutMinutes) });
      }
      case "condition": {
        const result = await evaluateCondition(step, state.vars, getFacts, adapters);
        state.nodeId = branchStart(step, result ? "yes" : "no");
        log(step, "branch", result ? "Se cumple" : "No se cumple");
        break;
      }
      case "add_tag":
      case "remove_tag": {
        const name = (await render(step.config.tagName)).trim();
        await (step.type === "add_tag" ? adapters.addTag(name) : adapters.removeTag(name));
        invalidateFacts();
        log(step, "ok", `${step.type === "add_tag" ? "Etiqueta agregada" : "Etiqueta quitada"}: ${name}`);
        state.nodeId = next;
        break;
      }
      case "set_lead_status": {
        await adapters.setLeadStatus(step.config.status);
        invalidateFacts();
        log(step, "ok", `Etapa: ${step.config.status}`);
        state.nodeId = next;
        break;
      }
      case "set_custom_field": {
        const value = await render(step.config.value);
        await adapters.setCustomField(step.config.key, value);
        invalidateFacts();
        log(step, "ok", `${step.config.key} = ${value.slice(0, 120)}`);
        state.nodeId = next;
        break;
      }
      case "assign": {
        await adapters.assign(step.config.mode, step.config.userId);
        log(step, "ok", step.config.mode === "auto" ? "Asignado automáticamente" : "Asignado");
        state.nodeId = next;
        break;
      }
      case "assign_team": {
        const name = await adapters.assignTeam(step.config.teamId);
        log(step, "ok", `Equipo: ${name}`);
        state.nodeId = next;
        break;
      }
      case "notify_team": {
        await adapters.notifyTeam(step.config.target, step.config.userId, await render(step.config.title), await render(step.config.body));
        log(step, "ok", "Aviso enviado al equipo");
        state.nodeId = next;
        break;
      }
      case "ai_classify": {
        const text = await adapters.lastInboundText();
        const categoryId = await adapters.aiClassify({ instructions: step.config.instructions, categories: step.config.categories, text });
        const category = step.config.categories.find((c) => c.id === categoryId);
        state.nodeId = branchStart(step, category ? category.id : "other");
        log(step, "branch", category ? `Clasificado como “${category.label}”` : "Sin clasificación (rama “otro”)");
        if (category) state.vars.categoria = category.label;
        break;
      }
      case "ai_extract": {
        const text = await adapters.lastInboundText();
        const value = await adapters.aiExtract({ what: step.config.what, format: step.config.format, text });
        if (value) {
          if (step.config.saveToVar) state.vars[step.config.saveToVar] = value;
          if (step.config.saveToCustomField) {
            await adapters.setCustomField(step.config.saveToCustomField, value);
            invalidateFacts();
          }
          log(step, "ok", `Extraído: ${value.slice(0, 120)}`);
        } else {
          log(step, "skipped", "La IA no encontró el dato");
        }
        state.nodeId = next;
        break;
      }
      case "ai_reply": {
        await adapters.handToBot();
        log(step, "ok", "La conversación pasó al bot IA");
        state.nodeId = null;
        return done({ status: "handed_to_bot" });
      }
      case "score_lead": {
        try {
          await adapters.scoreLead(step.config.scorerId);
          invalidateFacts();
          log(step, "ok", "Lead calificado");
        } catch (err) {
          log(step, "error", `No se pudo calificar: ${err instanceof Error ? err.message : String(err)}`);
        }
        state.nodeId = next;
        break;
      }
      case "webhook": {
        try {
          const res = await adapters.webhook({ url: step.config.url, method: step.config.method, body: await render(step.config.body) });
          if (step.config.saveToVar) {
            state.vars[`${step.config.saveToVar}.status`] = String(res.status);
            for (const [k, v] of Object.entries(res.data ?? {})) {
              if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") state.vars[`${step.config.saveToVar}.${k}`] = String(v);
            }
          }
          log(step, res.status >= 200 && res.status < 300 ? "ok" : "error", `Respuesta HTTP ${res.status}`);
        } catch (err) {
          if (step.config.saveToVar) state.vars[`${step.config.saveToVar}.status`] = "error";
          log(step, "error", `Webhook falló: ${err instanceof Error ? err.message : String(err)}`);
        }
        state.nodeId = next;
        break;
      }
      case "handoff": {
        if (step.config.message) {
          const failed = await trySend(step, { type: "text", text: await render(step.config.message) });
          if (failed && failed.status !== "expired") return done(failed);
        }
        await adapters.handoff({ assign: step.config.assign });
        log(step, "ok", "Conversación pasada a un humano");
        state.nodeId = null;
        return done({ status: "handed_off" });
      }
      case "end":
        log(step, "ok", "Fin");
        state.nodeId = null;
        return done({ status: "completed" });
    }
  }
  // El grafo es un árbol (no hay bucles): una cadena larga sin esperas solo
  // se parte en varios avances para no acaparar el worker.
  log(null, "ok", `Se ejecutaron ${MAX_STEPS_PER_ADVANCE} pasos seguidos; continúa en el siguiente avance`);
  return done({ status: "waiting_delay", until: adapters.now() });

  // Respuesta que no coincide con ninguna opción.
  async function handleUnmatched(step: StepOf<"send_buttons"> | StepOf<"send_list">): Promise<Outcome | null> {
    const waiting = state.waiting!;
    if (step.config.fallback === "reprompt" && waiting.reprompts < MAX_REPROMPTS) {
      waiting.reprompts++;
      const text = `No te entendí 🙏 Elige una opción:\n${numberedMenu(step.config.options)}`;
      const failed = await trySend(step, interactiveMessage(step, text));
      if (failed) return failed;
      log(step, "waiting", "Respuesta no reconocida: se repitieron las opciones");
      return { status: "waiting_reply", until: addMinutes(adapters.now(), step.config.timeoutMinutes) };
    }
    state.waiting = null;
    if (step.config.fallback === "handoff") {
      await adapters.handoff({ assign: "auto" });
      state.nodeId = null;
      log(step, "ok", "Respuesta no reconocida: pasó a un humano");
      return { status: "handed_off" };
    }
    state.nodeId = branchStart(step, "other");
    log(step, "branch", "Respuesta no reconocida (rama “otra respuesta”)");
    return null;
  }
}

function interactiveMessage(step: StepOf<"send_buttons"> | StepOf<"send_list">, text: string): OutgoingMessage {
  return step.type === "send_buttons"
    ? { type: "buttons", text, options: step.config.options }
    : { type: "list", text, buttonLabel: step.config.buttonLabel, options: step.config.options };
}

async function resolveOption(
  step: StepOf<"send_buttons"> | StepOf<"send_list">,
  reply: { text: string; replyId: string | null },
  adapters: ExecutorAdapters
): Promise<Option | null> {
  const direct = matchOption(step.config.options, reply);
  if (direct) return direct;
  if (!step.config.aiMatch || !reply.text.trim()) return null;
  const id = await adapters.aiMatchOption(step.config.options, reply.text);
  return step.config.options.find((o) => o.id === id) ?? null;
}

async function evaluateCondition(
  step: StepOf<"condition">,
  vars: Record<string, string>,
  getFacts: () => Promise<Facts>,
  adapters: ExecutorAdapters
): Promise<boolean> {
  const results: boolean[] = [];
  for (const rule of step.config.rules) results.push(await evaluateRule(rule, vars, getFacts, adapters));
  return step.config.match === "all" ? results.every(Boolean) : results.some(Boolean);
}

export async function evaluateRule(
  rule: ConditionRule,
  vars: Record<string, string>,
  getFacts: () => Promise<Facts>,
  adapters: Pick<ExecutorAdapters, "isBusinessHours">
): Promise<boolean> {
  switch (rule.subject) {
    case "business_hours": {
      const open = await adapters.isBusinessHours();
      return rule.op === "absent" ? !open : open;
    }
    case "var":
      return compare(vars[rule.key ?? ""] ?? null, rule);
    case "custom_field":
      return compare((await getFacts()).customFields[rule.key ?? ""] ?? null, rule);
    case "lead_status":
      return compare((await getFacts()).leadStatus, rule);
    case "channel":
      return compare((await getFacts()).channel, rule);
    case "tag":
    case "score_label": {
      const f = await getFacts();
      const list = (rule.subject === "tag" ? f.tags : f.scoreLabels).map(normalize);
      const has = list.includes(normalize(rule.value ?? ""));
      if (rule.op === "present") return list.length > 0;
      if (rule.op === "absent") return list.length === 0;
      if (rule.op === "contains") return list.some((t) => t.includes(normalize(rule.value ?? "")));
      return rule.op === "not_equals" ? !has : has;
    }
  }
}

function compare(actual: string | null, rule: ConditionRule): boolean {
  const a = normalize(actual ?? "");
  const v = normalize(rule.value ?? "");
  switch (rule.op) {
    case "present":
      return a.length > 0;
    case "absent":
      return a.length === 0;
    case "equals":
      return a === v;
    case "not_equals":
      return a !== v;
    case "contains":
      return a.includes(v);
  }
}

function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}

export function formatMinutes(minutes: number): string {
  if (minutes % (24 * 60) === 0) return `${minutes / (24 * 60)} día(s)`;
  if (minutes % 60 === 0) return `${minutes / 60} h`;
  return `${minutes} min`;
}
