import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAIProvider } from "@/lib/ai/factory";
import { getPlatformApiKey } from "@/lib/ai/platform";
import { wrapUserPrompt, SCOPE_GUARDRAIL } from "@/lib/ai/prompt-sanitizer";
import type { AIProvider } from "@/lib/ai/types";
import { rateLimit } from "@/lib/rate-limit";
import { reserveAiCredit } from "@/lib/ai/credits";
import { recordBotUsage } from "@/lib/bots/usage";
import { publicErrorMessage } from "@/lib/api-errors";
import { orgWhere } from "@/lib/tenancy";

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

    const { message } = (await req.json()) as { message: string };

    if (!message?.trim()) {
      return NextResponse.json({ error: "El mensaje es requerido" }, { status: 400 });
    }

    const provider = bot.provider as AIProvider;
    const apiKey = await getPlatformApiKey(provider);

    if (!apiKey) {
      return NextResponse.json(
        { error: "La IA no está disponible en este momento. Intenta más tarde." },
        { status: 400 }
      );
    }

    if (!(await reserveAiCredit(bot.organizationId))) {
      return NextResponse.json({ error: "Se acabaron los créditos de IA de este mes. Mejora tu plan en Configuración → Plan y facturación.", code: "ai_credits" }, { status: 402 });
    }

    const client = getAIProvider(provider, apiKey);

    const messages = [
      { role: "system" as const, content: wrapUserPrompt(bot.systemPrompt) },
      { role: "system" as const, content: SCOPE_GUARDRAIL },
      { role: "user" as const, content: message },
    ];

    const result = await client.complete({
      model: bot.model,
      messages,
      temperature: bot.temperature,
      maxTokens: bot.maxTokens,
    });

    // Las pruebas también gastan: antes no se registraban y el presupuesto
    // mensual quedaba por debajo del gasto real.
    await recordBotUsage({ botId: bot.id, userId: bot.userId, model: bot.model, provider, usage: result.usage }).catch((err) =>
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
