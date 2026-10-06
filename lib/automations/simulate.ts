import { prisma } from "@/lib/prisma";
import { isWithinBusinessHours } from "@/lib/whatsapp/lead-recovery";
import { execute, type ExecutorAdapters, type Facts, type OutgoingMessage } from "./executor";
import { aiClassify, aiExtract, aiMatchOption } from "./ai";
import type { Graph, RunInput, RunState } from "./types";
import type { AutomationChannel } from "./validate";
import { getOrgBusinessHours } from "@/lib/organizations";

// "Probar" del editor: el MISMO ejecutor con adaptadores de simulación. Nada
// sale a Meta/Telegram ni toca el CRM real — los efectos se describen en la
// transcripción. La IA sí es la real del dueño (con su presupuesto), para
// probar clasificaciones de verdad; los webhooks no se llaman.

export interface SimFacts {
  name: string;
  tags: string[];
  // Etapas (ids) de los negocios abiertos del contacto de prueba.
  dealStageIds: string[];
  customFields: Record<string, string | null>;
}

export type SimEntry =
  | { kind: "bot"; text: string; options?: { id: string; title: string }[]; style?: "buttons" | "list" }
  | { kind: "effect"; text: string };

export interface SimulationResult {
  state: RunState;
  facts: SimFacts;
  outcome: { status: string; until?: string; error?: string };
  transcript: SimEntry[];
  logs: { nodeId: string | null; outcome: string; detail: string }[];
}

export async function simulate(input: {
  graph: Graph;
  state: RunState | null;
  facts: SimFacts;
  runInput: RunInput;
  channel: AutomationChannel;
  ownerId: string;
  organizationId: string;
  automationId: string;
}): Promise<SimulationResult> {
  const facts: SimFacts = { ...input.facts, tags: [...input.facts.tags], customFields: { ...input.facts.customFields } };
  const transcript: SimEntry[] = [];
  const effect = (text: string): void => {
    transcript.push({ kind: "effect", text });
  };
  const aiCtx = { ownerId: input.ownerId, organizationId: input.organizationId, automationId: input.automationId, runId: null, waChatId: null, conversationId: null };

  const templateName = async (id: string) =>
    (await prisma.wATemplate.findUnique({ where: { id }, select: { name: true } }))?.name ?? "plantilla";

  const adapters: ExecutorAdapters = {
    now: () => new Date(),
    facts: async (): Promise<Facts> => ({
      contact: { name: facts.name, phone: "5215500000000" },
      customFields: facts.customFields,
      tags: facts.tags,
      dealStageIds: facts.dealStageIds,
      scoreLabels: [],
      channel: input.channel,
    }),
    lastInboundText: async () => (input.runInput.kind === "reply" ? input.runInput.text : (input.state?.vars.respuesta ?? input.state?.vars.mensaje ?? "")),
    isBusinessHours: async () => {
      return isWithinBusinessHours(new Date(), await getOrgBusinessHours(input.organizationId));
    },
    send: async (m: OutgoingMessage) => {
      if (m.type === "text") transcript.push({ kind: "bot", text: m.text });
      else if (m.type === "buttons") transcript.push({ kind: "bot", text: m.text, options: m.options, style: "buttons" });
      else if (m.type === "list") transcript.push({ kind: "bot", text: m.text, options: m.options, style: "list" });
      else transcript.push({ kind: "bot", text: `📄 Plantilla “${await templateName(m.templateId)}”${m.bodyParams.length ? ` (${m.bodyParams.join(", ")})` : ""}` });
    },
    addTag: async (name) => {
      if (!facts.tags.includes(name)) facts.tags.push(name);
      effect(`Etiqueta agregada: ${name}`);
    },
    removeTag: async (name) => {
      facts.tags = facts.tags.filter((t) => t.toLowerCase() !== name.toLowerCase());
      effect(`Etiqueta quitada: ${name}`);
    },
    setDealStage: async (stageId) => {
      const stage = await prisma.pipelineStage.findFirst({ where: { id: stageId, pipeline: { organizationId: input.organizationId } }, select: { name: true } });
      facts.dealStageIds = [stageId];
      const summary = `Negocio movido a ${stage?.name ?? "la etapa elegida"}`;
      effect(summary);
      return { summary };
    },
    setCustomField: async (k, v) => {
      facts.customFields[k] = v;
      effect(`Campo ${k} = ${v}`);
    },
    assign: async (mode) => effect(mode === "auto" ? "Se asignaría automáticamente" : "Se asignaría al usuario elegido"),
    notifyTeam: async (_t, _u, title) => effect(`Aviso al equipo: ${title}`),
    aiClassify: (i) => aiClassify(aiCtx, i),
    aiExtract: (i) => aiExtract(aiCtx, i),
    aiMatchOption: (o, t) => aiMatchOption(aiCtx, o, t),
    scoreLead: async () => effect("Se calificaría el lead"),
    webhook: async ({ url }) => {
      effect(`Webhook a ${url} (no se llama en la prueba)`);
      return { status: 0, data: null };
    },
    handToBot: async () => effect("La conversación pasaría al bot IA"),
    handoff: async () => effect("La conversación pasaría a una persona del equipo"),
  };

  const initial: RunState = input.state ?? { nodeId: input.graph.steps[0]?.id ?? null, vars: {}, waiting: null };
  const result = await execute(input.graph, initial, input.runInput, adapters);
  const o = result.outcome;
  return {
    state: result.state,
    facts,
    outcome: {
      status: o.status,
      ...("until" in o ? { until: o.until.toISOString() } : {}),
      ...("error" in o ? { error: o.error } : {}),
    },
    transcript,
    logs: result.logs.map((l) => ({ nodeId: l.nodeId, outcome: l.outcome, detail: l.detail })),
  };
}
