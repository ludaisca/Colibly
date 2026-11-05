import type { ExecutorAdapters, Facts, OutgoingMessage } from "../executor";
import { SendFailure } from "../executor";
import type { Graph, RunState, Step, Trigger } from "../types";

// Adaptadores falsos: registran cada efecto en `calls` y permiten programar
// fallos de envío y respuestas de IA.
export function fakeAdapters(overrides: Partial<Facts> = {}) {
  const calls: { op: string; arg?: unknown }[] = [];
  const facts: Facts = {
    contact: { name: "Ana", phone: "5215500000001" },
    customFields: {},
    tags: [],
    leadStatus: "NEW",
    scoreLabels: [],
    channel: "WHATSAPP",
    ...overrides,
  };
  const control = {
    sendFailures: [] as SendFailure[],
    classify: null as string | null,
    matchOption: null as string | null,
    businessHours: true,
    now: new Date("2026-09-25T15:00:00Z"),
  };
  const adapters: ExecutorAdapters = {
    now: () => control.now,
    facts: async () => ({ ...facts, customFields: { ...facts.customFields }, tags: [...facts.tags] }),
    lastInboundText: async () => "quiero un masaje",
    isBusinessHours: async () => control.businessHours,
    send: async (m: OutgoingMessage) => {
      const failure = control.sendFailures.shift();
      if (failure) throw failure;
      calls.push({ op: "send", arg: m });
    },
    addTag: async (name) => {
      facts.tags.push(name);
      calls.push({ op: "addTag", arg: name });
    },
    removeTag: async (name) => {
      facts.tags = facts.tags.filter((t) => t !== name);
      calls.push({ op: "removeTag", arg: name });
    },
    setLeadStatus: async (s) => {
      facts.leadStatus = s;
      calls.push({ op: "setLeadStatus", arg: s });
    },
    setCustomField: async (k, v) => {
      facts.customFields[k] = v;
      calls.push({ op: "setCustomField", arg: [k, v] });
    },
    assign: async (mode, userId) => void calls.push({ op: "assign", arg: [mode, userId] }),
    assignTeam: async (teamId) => {
      calls.push({ op: "assignTeam", arg: teamId });
      return "Ventas";
    },
    notifyTeam: async (target, userId, title) => void calls.push({ op: "notify", arg: title }),
    aiClassify: async () => control.classify,
    aiExtract: async () => "2026-10-03",
    aiMatchOption: async () => control.matchOption,
    scoreLead: async (id) => void calls.push({ op: "scoreLead", arg: id }),
    webhook: async () => ({ status: 200, data: { pedido: "A-17", total: 950 } }),
    handToBot: async () => void calls.push({ op: "handToBot" }),
    handoff: async (i) => void calls.push({ op: "handoff", arg: i.assign }),
  };
  const sent = () => calls.filter((c) => c.op === "send").map((c) => c.arg as OutgoingMessage);
  return { adapters, calls, control, sent, facts };
}

export function graph(steps: Step[], trigger: Trigger = { type: "keyword", keywords: ["hola"], match: "contains" }): Graph {
  return { version: 1, trigger, steps };
}

export function startState(g: Graph): RunState {
  return { nodeId: g.steps[0]?.id ?? null, vars: {}, waiting: null };
}

export const text = (id: string, t: string): Step => ({ id, type: "send_text", config: { text: t } });

export function buttons(id: string, options: string[], branches: Record<string, Step[]> = {}, extra: Partial<{ fallback: "reprompt" | "other" | "handoff"; aiMatch: boolean }> = {}): Step {
  const opts = options.map((title, i) => ({ id: `${id}_o${i + 1}`, title }));
  return {
    id,
    type: "send_buttons",
    config: { text: "¿Qué te interesa?", options: opts, timeoutMinutes: 60, fallback: extra.fallback ?? "reprompt", aiMatch: extra.aiMatch ?? false },
    branches: [
      ...opts.map((o) => ({ id: `${o.id}_b`, key: o.id, label: o.title, steps: branches[o.title] ?? [] })),
      { id: `${id}_other`, key: "other", label: "Otra respuesta", steps: branches.other ?? [] },
      { id: `${id}_timeout`, key: "timeout", label: "Sin respuesta", steps: branches.timeout ?? [] },
    ],
  };
}

export { SendFailure };
