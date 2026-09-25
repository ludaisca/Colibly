import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getEligibleAssignees, getEligibleChannelAssignees } from "@/lib/chat-assignees";
import { parseSafeUrl, SafeFetchError } from "@/lib/net/safe-fetch";
import { isConversationalGraph, GraphIndex } from "./graph";
import { validateGraph, type AutomationChannel, type ValidationIssue } from "./validate";
import type { Graph } from "./types";

// Validación de servidor al publicar: además de validateGraph (estructura,
// límites de Meta), comprueba contra la base lo que el editor no puede ver —
// que la plantilla sea de ESTA cuenta y esté aprobada, que el usuario al que
// se asigna tenga acceso, que el campo y el calificador existan, que la URL
// del webhook sea segura. Sin esto un draftGraph armado a mano podría
// apuntar a recursos de otro cliente.

// Forma mínima del grafo — el detalle lo revisa validateGraph.
const graphShape = z.object({
  version: z.literal(1),
  trigger: z.object({ type: z.string() }).passthrough(),
  steps: z.array(z.object({ id: z.string(), type: z.string() }).passthrough()),
});

export function parseGraph(raw: unknown): Graph | null {
  return graphShape.safeParse(raw).success ? (raw as Graph) : null;
}

export async function validateForPublish(
  graph: Graph,
  scope: { waAccountId: string | null; channelAccountId: string | null; ownerId: string },
  channel: AutomationChannel
): Promise<ValidationIssue[]> {
  const issues = validateGraph(graph, channel);
  const err = (nodeId: string | null, message: string) => issues.push({ nodeId, level: "error", message });
  const steps = new GraphIndex(graph).all();

  const templateIds = new Set<string>();
  for (const s of steps) {
    if (s.type === "send_template") templateIds.add(s.config.templateId);
    if (s.type === "send_text" && s.config.fallbackTemplateId) templateIds.add(s.config.fallbackTemplateId);
  }
  if (templateIds.size > 0) {
    const templates = scope.waAccountId
      ? await prisma.wATemplate.findMany({ where: { id: { in: [...templateIds] }, waAccountId: scope.waAccountId }, select: { id: true, status: true, name: true } })
      : [];
    for (const s of steps) {
      const ids = s.type === "send_template" ? [s.config.templateId] : s.type === "send_text" && s.config.fallbackTemplateId ? [s.config.fallbackTemplateId] : [];
      for (const id of ids) {
        const t = templates.find((x) => x.id === id);
        if (!t) err(s.id, "La plantilla no existe en esta cuenta");
        else if (t.status !== "APPROVED") err(s.id, `La plantilla “${t.name}” no está aprobada por Meta`);
      }
    }
  }

  const assignees = steps.some((s) => (s.type === "assign" && s.config.mode === "user") || (s.type === "notify_team" && s.config.target === "user"))
    ? (scope.waAccountId ? await getEligibleAssignees(scope.waAccountId) : await getEligibleChannelAssignees(scope.channelAccountId!)).map((u) => u.id)
    : [];
  const fieldKeys = new Set(
    (
      await prisma.contactCustomFieldDefinition.findMany({
        where: scope.waAccountId ? { waAccountId: scope.waAccountId } : { channelAccountId: scope.channelAccountId },
        select: { key: true },
      })
    ).map((d) => d.key)
  );

  for (const s of steps) {
    if (s.type === "assign" && s.config.mode === "user" && s.config.userId && !assignees.includes(s.config.userId)) {
      err(s.id, "Ese usuario no tiene acceso a esta cuenta");
    }
    if (s.type === "notify_team" && s.config.target === "user" && s.config.userId && !assignees.includes(s.config.userId)) {
      err(s.id, "Ese usuario no tiene acceso a esta cuenta");
    }
    const key =
      s.type === "set_custom_field"
        ? s.config.key
        : s.type === "wait_for_reply" || s.type === "ai_extract"
          ? s.config.saveToCustomField
          : null;
    if (key && !fieldKeys.has(key)) err(s.id, `El campo personalizado “${key}” no existe en esta cuenta`);
    if (s.type === "score_lead") {
      const scorer = await prisma.wALeadScorerBot.findFirst({ where: { id: s.config.scorerId, userId: scope.ownerId }, select: { id: true } });
      if (!scorer) err(s.id, "El calificador no existe o no es del dueño de la cuenta");
    }
    if (s.type === "webhook") {
      try {
        parseSafeUrl(s.config.url);
      } catch (e) {
        err(s.id, e instanceof SafeFetchError ? e.message : "URL no válida");
      }
    }
  }
  return issues;
}

// Publica el borrador como nueva versión inmutable y activa la automatización.
export async function publishAutomation(automationId: string, graph: Graph, userId: string) {
  return prisma.$transaction(async (tx) => {
    const last = await tx.automationVersion.findFirst({
      where: { automationId },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const version = await tx.automationVersion.create({
      data: { automationId, version: (last?.version ?? 0) + 1, graph: graph as unknown as Prisma.InputJsonValue, publishedById: userId },
    });
    const { type, ...config } = graph.trigger;
    return tx.automation.update({
      where: { id: automationId },
      data: {
        publishedVersionId: version.id,
        status: "ACTIVE",
        triggerType: type,
        triggerConfig: config as Prisma.InputJsonValue,
        conversational: isConversationalGraph(graph),
      },
      include: { publishedVersion: { select: { id: true, version: true, publishedAt: true } } },
    });
  });
}
