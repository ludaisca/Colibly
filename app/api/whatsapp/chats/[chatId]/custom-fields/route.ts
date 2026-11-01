import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveChatChannel } from "@/lib/chat-resolver";
import { getUserChannelAccountIds } from "@/lib/shared-accounts";
import { chatCustomFieldValuesSchema } from "@/lib/validations";
import { publicErrorMessage } from "@/lib/api-errors";

async function loadContext(userId: string, chatId: string) {
  const resolved = await resolveChatChannel(chatId, userId);
  if (!resolved) return null;

  if (resolved.channel === "WHATSAPP") {
    const chat = await prisma.wAChat.findFirst({
      where: { id: chatId, accountId: { in: resolved.accountIds } },
      select: { accountId: true, customFields: true },
    });
    if (!chat) return null;
    const definitions = await prisma.chatCustomFieldDefinition.findMany({
      where: { waAccountId: chat.accountId },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    });
    return { kind: "whatsapp" as const, chatId, customFields: chat.customFields, definitions };
  }

  const channelAccountIds = await getUserChannelAccountIds(userId);
  const conversation = await prisma.conversation.findFirst({
    where: { id: chatId, channelAccountId: { in: channelAccountIds } },
    select: { channelAccountId: true, customFields: true },
  });
  if (!conversation) return null;
  const definitions = await prisma.chatCustomFieldDefinition.findMany({
    where: { channelAccountId: conversation.channelAccountId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  return { kind: "channel" as const, chatId, customFields: conversation.customFields, definitions };
}

function valuesFromJson(json: Prisma.JsonValue, definitions: Array<{ key: string }>): Record<string, string> {
  if (!json || typeof json !== "object" || Array.isArray(json)) return {};
  const allowed = new Set(definitions.map((definition) => definition.key));
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(json)) {
    if (allowed.has(key) && typeof value === "string") values[key] = value;
  }
  return values;
}

export async function GET(_req: Request, { params }: { params: Promise<{ chatId: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { chatId } = await params;
    const context = await loadContext(session.user.id, chatId);
    if (!context) return NextResponse.json({ error: "Chat no encontrado" }, { status: 404 });
    return NextResponse.json({
      definitions: context.definitions,
      values: valuesFromJson(context.customFields, context.definitions),
    });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ chatId: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { chatId } = await params;
    const context = await loadContext(session.user.id, chatId);
    if (!context) return NextResponse.json({ error: "Chat no encontrado" }, { status: 404 });

    const parsed = chatCustomFieldValuesSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

    const values: Record<string, string> = {};
    for (const definition of context.definitions) {
      const raw = parsed.data.values[definition.key];
      const value = raw?.trim();
      if (!value) continue;
      if (definition.type === "SELECT" && definition.options.length > 0 && !definition.options.includes(value)) {
        return NextResponse.json({ error: `Valor no válido para ${definition.label}` }, { status: 400 });
      }
      values[definition.key] = value.slice(0, 2000);
    }

    const data = Object.keys(values).length > 0 ? values : Prisma.JsonNull;
    if (context.kind === "whatsapp") {
      await prisma.wAChat.update({ where: { id: chatId }, data: { customFields: data } });
    } else {
      await prisma.conversation.update({ where: { id: chatId }, data: { customFields: data } });
    }
    return NextResponse.json({ values });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}
