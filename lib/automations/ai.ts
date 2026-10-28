import { prisma } from "@/lib/prisma";
import { getAIProvider } from "@/lib/ai/factory";
import { getPlatformApiKey, resolvePlatformModel } from "@/lib/ai/platform";
import { estimateCost } from "@/lib/ai/pricing";
import { reserveAiCredit } from "@/lib/ai/credits";
import { SCOPE_GUARDRAIL, wrapUserPrompt } from "@/lib/ai/prompt-sanitizer";

// IA de los pasos de automatización: OpenCode por defecto, y un crédito de la
// organización por llamada. Devuelve null en vez de lanzar si no hay IA
// disponible (sin créditos, sin proveedor, respuesta ilegible): los pasos
// tienen una rama "otro" / seguir sin el dato para ese caso.

export interface AiCallContext {
  ownerId: string;
  organizationId: string;
  automationId: string;
  runId: string | null;
  waChatId: string | null;
  conversationId: string | null;
}

async function complete(ctx: AiCallContext, system: string, user: string, maxTokens: number): Promise<string | null> {
  const picked = await resolvePlatformModel();
  if (!picked) return null;
  const { provider, model } = picked;
  const apiKey = await getPlatformApiKey(provider);
  if (!apiKey) return null;
  if (!(await reserveAiCredit(ctx.organizationId))) return null;

  const result = await getAIProvider(provider, apiKey).complete({
    model,
    temperature: 0,
    maxTokens,
    sessionId: ctx.conversationId ?? ctx.waChatId ?? ctx.runId ?? ctx.automationId,
    messages: [
      { role: "system", content: system },
      { role: "system", content: SCOPE_GUARDRAIL },
      { role: "user", content: user.slice(-4000) },
    ],
  });

  if (result.usage) {
    const { promptTokens, completionTokens } = result.usage;
    await prisma.automationAiUsage.create({
      data: {
        automationId: ctx.automationId,
        runId: ctx.runId,
        userId: ctx.ownerId,
        waChatId: ctx.waChatId,
        conversationId: ctx.conversationId,
        model,
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        estimatedCost: await estimateCost(model, promptTokens, completionTokens, provider),
      },
    });
  }
  return result.content;
}

// Toma la primera línea con un id válido; los modelos a veces agregan texto.
function pickId(raw: string | null, ids: string[]): string | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/[`"'.]/g, "");
  return ids.find((id) => cleaned === id) ?? ids.find((id) => cleaned.includes(id)) ?? null;
}

export async function aiClassify(
  ctx: AiCallContext,
  input: { instructions: string; categories: { id: string; label: string; description: string }[]; text: string }
): Promise<string | null> {
  const list = input.categories.map((c) => `- ${c.id}: ${c.label}${c.description ? ` — ${c.description}` : ""}`).join("\n");
  const system =
    `Clasifica el mensaje de un cliente en UNA de estas categorías:\n${list}\n- other: ninguna aplica\n` +
    `Responde solo con el id de la categoría, sin nada más.` +
    (input.instructions.trim() ? `\n\n${wrapUserPrompt(input.instructions, 1500)}` : "");
  return pickId(await complete(ctx, system, input.text, 20), input.categories.map((c) => c.id));
}

export async function aiMatchOption(ctx: AiCallContext, options: { id: string; title: string }[], text: string): Promise<string | null> {
  const list = options.map((o) => `- ${o.id}: ${o.title}`).join("\n");
  const system =
    `El cliente respondió a un menú con estas opciones:\n${list}\n` +
    `¿Qué opción quiso elegir? Responde solo con el id. Si no eligió ninguna con claridad, responde "none".`;
  return pickId(await complete(ctx, system, text, 20), options.map((o) => o.id));
}

export async function aiExtract(ctx: AiCallContext, input: { what: string; format: string; text: string }): Promise<string | null> {
  const formatHint =
    input.format === "date"
      ? "una fecha en formato AAAA-MM-DD"
      : input.format === "number"
        ? "solo el número, sin símbolos"
        : input.format === "email"
          ? "solo el correo"
          : "el texto exacto, breve";
  const system =
    `Extrae de la conversación el siguiente dato: ${wrapUserPrompt(input.what, 500)}\n` +
    `Responde con ${formatHint}. Si el dato no aparece, responde exactamente "NONE".`;
  const raw = (await complete(ctx, system, input.text, 60))?.trim() ?? null;
  if (!raw || raw.toUpperCase() === "NONE") return null;
  return raw.replace(/^["'`]|["'`]$/g, "").slice(0, 500);
}
