import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveChatChannel } from "@/lib/chat-resolver";
import { getBotControlState, type BotChatRef } from "@/lib/bots/guards";
import { isBotWritable } from "@/lib/billing/gates";
import { channelFeatureMessage } from "@/lib/billing/entitlements";
import { aiCreditStatus } from "@/lib/ai/credits";
import { resolvePlatformModel } from "@/lib/ai/platform";
import { publicErrorMessage } from "@/lib/api-errors";

type Params = { params: Promise<{ chatId: string }> };

async function context(chatId: string, userId: string): Promise<{ ref: BotChatRef; accountId: string; whatsapp: boolean } | null> {
  const resolved = await resolveChatChannel(chatId, userId);
  if (!resolved) return null;
  if (resolved.channel === "WHATSAPP") {
    const chat = await prisma.wAChat.findUnique({ where: { id: chatId }, select: { accountId: true } });
    return chat ? { ref: { waChatId: chatId }, accountId: chat.accountId, whatsapp: true } : null;
  }
  const chat = await prisma.conversation.findUnique({ where: { id: chatId }, select: { channelAccountId: true } });
  return chat ? { ref: { conversationId: chatId }, accountId: chat.channelAccountId, whatsapp: false } : null;
}

async function modeFor(ctx: NonNullable<Awaited<ReturnType<typeof context>>>) {
  const control = await getBotControlState(ctx.ref);
  if (control.kind === "automation") {
    return { mode: "AUTOMATION", detail: control.name, until: null, canResume: false };
  }
  if (control.kind === "handoff") {
    return { mode: "HANDOFF", detail: "Una automatización pasó el chat a un humano", until: control.until.toISOString(), canResume: false };
  }

  const bot = await prisma.wABot.findFirst({
    where: { ...(ctx.whatsapp ? { waAccountId: ctx.accountId } : { channelAccountId: ctx.accountId }), isActive: true },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, status: true, organizationId: true, provider: true },
  });
  if (!bot) return { mode: "OFF", detail: "No hay un bot activo para esta cuenta", until: null, canResume: false };
  if (bot.status !== "ACTIVE") return { mode: "OFF", detail: `El bot ${bot.name} tiene un error y requiere revisión`, until: null, canResume: false };
  if (!(await isBotWritable(bot.id))) return { mode: "OFF", detail: "El plan no permite respuestas del bot en este momento", until: null, canResume: false };
  if (!(await resolvePlatformModel())) {
    return { mode: "OFF", detail: "El proveedor de IA del bot no está configurado", until: null, canResume: false };
  }
  // Licencia y créditos del dueño del canal (reglas 3 y 6 de las licencias).
  const channel = ctx.whatsapp ? { waAccountId: ctx.accountId } : { channelAccountId: ctx.accountId };
  const blocked = await channelFeatureMessage(channel, "aiAgent");
  if (blocked) return { mode: "OFF", detail: blocked, until: null, canResume: false };
  const credits = await aiCreditStatus({ channel });
  if (!credits || credits.used >= credits.max) {
    return { mode: "OFF", detail: "Los créditos de IA del dueño de este canal se agotaron en este periodo", until: null, canResume: false };
  }

  if (control.kind === "human") {
    return { mode: "HUMAN", detail: `El bot ${bot.name} espera tras una respuesta manual`, until: control.until.toISOString(), canResume: true };
  }
  return { mode: "AI", detail: `El bot ${bot.name} responderá al próximo mensaje`, until: null, canResume: false };
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { chatId } = await params;
    const ctx = await context(chatId, session.user.id);
    if (!ctx) return NextResponse.json({ error: "Chat no encontrado" }, { status: 404 });
    return NextResponse.json(await modeFor(ctx), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error al consultar el modo del chat") }, { status: 500 });
  }
}

export async function POST(_req: Request, { params }: Params) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { chatId } = await params;
    const ctx = await context(chatId, session.user.id);
    if (!ctx) return NextResponse.json({ error: "Chat no encontrado" }, { status: 404 });
    const current = await modeFor(ctx);
    if (current.mode !== "HUMAN") {
      return NextResponse.json({ error: "Solo puedes devolver al bot un chat pausado por una respuesta manual" }, { status: 409 });
    }
    const now = new Date();
    if (ctx.whatsapp) {
      await prisma.wAChat.update({ where: { id: chatId }, data: { botResumedAt: now } });
    } else {
      await prisma.conversation.update({ where: { id: chatId }, data: { botResumedAt: now } });
    }
    return NextResponse.json(await modeFor(ctx));
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "No se pudo devolver el chat al bot") }, { status: 500 });
  }
}
