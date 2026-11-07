import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAIProvider } from "@/lib/ai/factory";
import { getPlatformApiKey, resolvePlatformModel } from "@/lib/ai/platform";
import { rateLimit } from "@/lib/rate-limit";
import { AI_CREDITS_EXHAUSTED_MESSAGE, reserveAiCredit } from "@/lib/ai/credits";
import { checkUserFeature } from "@/lib/billing/entitlements";
import { recordBotUsage } from "@/lib/bots/usage";
import { publicErrorMessage } from "@/lib/api-errors";
import { orgWhere } from "@/lib/tenancy";
import { searchKnowledge } from "@/lib/ai/rag";
import { z } from "zod";
import { buildTestMessages } from "@/lib/bots/test-conversation";

const testRequest = z.object({
  message: z.string().trim().min(1).max(4000),
  history: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1).max(4000),
  })).max(100).default([]),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (session.user.role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    // Cada llamada gasta IA: límite por usuario además del tope mensual de
    // presupuesto (que al agotarse también apaga los bots legítimos).
    const { allowed } = await rateLimit(`ai-bot-test:${session.user.id}`, 20, 60);
    if (!allowed) {
      return NextResponse.json({ error: "Demasiadas solicitudes de IA, espera un momento" }, { status: 429 });
    }

    const { id } = await params;

    const bot = await prisma.wABot.findFirst({
      where: { id, ...(await orgWhere(session.user.id)) },
    });

    if (!bot) {
      return NextResponse.json({ error: "Bot no encontrado" }, { status: 404 });
    }

    const parsed = testRequest.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Mensaje o historial de prueba inválido" }, { status: 400 });
    }
    const { message, history } = parsed.data;

    // Como el worker real: proveedor y modelo los decide la plataforma, no el bot.
    const picked = await resolvePlatformModel();
    const provider = picked?.provider ?? "google";
    const model = picked?.model ?? bot.model;
    const apiKey = picked ? await getPlatformApiKey(provider) : null;

    if (!apiKey) {
      return NextResponse.json(
        { error: "La IA no está disponible en este momento. Intenta más tarde." },
        { status: 400 }
      );
    }

    // Probar el bot lo pide una persona: gasta sus créditos (regla 6).
    const noAi = await checkUserFeature(session.user.id, "aiAssist");
    if (noAi) return noAi;
    if (!(await reserveAiCredit({ userId: session.user.id }))) {
      return NextResponse.json({ error: AI_CREDITS_EXHAUSTED_MESSAGE, code: "ai_credits" }, { status: 402 });
    }

    const client = getAIProvider(provider, apiKey);

    // Igual que el worker real: recupera conocimiento para la pregunta actual
    // y aplica el tipo de memoria configurado. El historial solo contiene
    // turnos user/assistant validados; nunca admite instrucciones system.
    const knowledge = bot.ragEnabled ? await searchKnowledge(bot.id, message, provider, apiKey) : null;
    const messages = buildTestMessages(bot, message, history, knowledge);

    const result = await client.complete({
      model,
      messages,
      temperature: bot.temperature,
      maxTokens: bot.maxTokens,
    });

    // Las pruebas también gastan: antes no se registraban y el presupuesto
    // mensual quedaba por debajo del gasto real.
    await recordBotUsage({ botId: bot.id, userId: bot.userId, model, provider, usage: result.usage }).catch((err) =>
      console.error("[bots/test] No se pudo registrar el uso de IA:", err instanceof Error ? err.message : err)
    );

    return NextResponse.json({
      response: result.content,
      usage: result.usage,
    });
  } catch (error) {
    const message = publicErrorMessage(error, "Error interno del servidor");
    const providerStatus = (error as { status?: unknown } | null)?.status;
    if (providerStatus === 503 || /503|high demand|overloaded/i.test(message)) {
      return NextResponse.json({ error: "El proveedor de IA está ocupado. Intenta de nuevo en unos minutos." }, { status: 503 });
    }
    if (providerStatus === 429 || /429|resource exhausted|quota exceeded/i.test(message)) {
      return NextResponse.json({ error: "El proveedor de IA alcanzó su límite temporal. Intenta más tarde." }, { status: 503 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
