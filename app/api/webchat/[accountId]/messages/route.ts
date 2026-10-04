import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { getWebchatCredentials, isOriginAllowed, corsHeaders, readWebchatToken } from "@/lib/webchat/account";
import { verifyWebchatToken } from "@/lib/webchat/session-token";
import { ingestChannelMessage } from "@/lib/telegram/ingest-message";
import { publicErrorMessage } from "@/lib/api-errors";

// Roadmap P3-f — rutas PÚBLICAS de mensajería del widget (ver session/route.ts
// para el modelo de autenticación). GET hace polling (mismo patrón de todo
// el proyecto, sin websockets); POST manda el mensaje del visitante.

async function resolveAccountAndVisitor(accountId: string, origin: string | null, token: string | null) {
  const account = await prisma.channelAccount.findUnique({ where: { id: accountId } });
  if (!account || account.channel !== "WEBCHAT" || account.status !== "CONNECTED") return null;

  const { allowedOrigins } = getWebchatCredentials(account);
  if (!isOriginAllowed(origin, allowedOrigins)) return null;

  if (!token) return null;
  const verified = verifyWebchatToken(token, accountId);
  if (!verified) return null;

  return { account, visitorId: verified.visitorId };
}

export async function OPTIONS(req: Request, { params }: { params: Promise<{ accountId: string }> }) {
  const origin = req.headers.get("origin");
  const { accountId } = await params;
  const account = await prisma.channelAccount.findUnique({ where: { id: accountId } });
  if (!account || account.channel !== "WEBCHAT") return new NextResponse(null, { status: 403 });
  const { allowedOrigins } = getWebchatCredentials(account);
  if (!isOriginAllowed(origin, allowedOrigins)) return new NextResponse(null, { status: 403 });
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin!) });
}

export async function POST(req: Request, { params }: { params: Promise<{ accountId: string }> }) {
  try {
    const origin = req.headers.get("origin");
    const { accountId } = await params;
    const body = await req.json().catch(() => ({}));
    const token = readWebchatToken(req, typeof body?.token === "string" ? body.token : null);

    const resolved = await resolveAccountAndVisitor(accountId, origin, token);
    if (!resolved) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    const { account, visitorId } = resolved;

    const forwarded = req.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() ?? "unknown";
    const [perVisitor, perIp] = await Promise.all([
      rateLimit(`webchat-send:${visitorId}`, 20, 60),
      rateLimit(`webchat-send-ip:${ip}`, 60, 60),
    ]);
    if (!perVisitor.allowed || !perIp.allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: corsHeaders(origin!) });
    }

    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!text || text.length > 2000) {
      return NextResponse.json({ error: "Mensaje inválido" }, { status: 400, headers: corsHeaders(origin!) });
    }
    // UUID opcional generado por el widget — permite que un reintento de red
    // del propio cliente (fetch falló pero el server sí procesó) no duplique
    // el mensaje, vía @@unique([conversationId, externalMessageId]).
    const clientMessageId = typeof body?.clientMessageId === "string" ? body.clientMessageId : null;
    // Id de la opción tocada en un mensaje con botones (automatizaciones/API).
    const replyId = typeof body?.replyId === "string" && body.replyId.length <= 64 ? body.replyId : null;

    // Tope de conversaciones NUEVAS por cuenta: cada una puede disparar
    // respuestas del bot de IA (con costo) — sin esto, un script abría cientos.
    const existingConversation = await prisma.conversation.findUnique({
      where: { channelAccountId_externalId: { channelAccountId: account.id, externalId: visitorId } },
      select: { id: true },
    });
    if (!existingConversation) {
      const newConversations = await rateLimit(`webchat-new-conversation:${account.id}`, 200, 3600);
      if (!newConversations.allowed) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: corsHeaders(origin!) });
      }
    }

    const result = await ingestChannelMessage(account.id, "WEBCHAT", {
      externalId: visitorId,
      externalMessageId: clientMessageId,
      timestamp: new Date(),
      type: "text",
      body: text,
      contactName: visitorId,
      isGroup: false,
      interactiveReplyId: replyId,
    });

    return NextResponse.json({ success: true, messageId: result?.messageId ?? null }, { headers: corsHeaders(origin!) });
  } catch (error) {
    const message = publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ accountId: string }> }) {
  try {
    const origin = req.headers.get("origin");
    const { accountId } = await params;
    const { searchParams } = new URL(req.url);
    const token = readWebchatToken(req, searchParams.get("token"));

    const resolved = await resolveAccountAndVisitor(accountId, origin, token);
    if (!resolved) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    const { account, visitorId } = resolved;

    const { allowed } = await rateLimit(`webchat-poll:${visitorId}`, 60, 60);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: corsHeaders(origin!) });
    }

    const conversation = await prisma.conversation.findUnique({
      where: { channelAccountId_externalId: { channelAccountId: account.id, externalId: visitorId } },
      select: { id: true },
    });
    if (!conversation) {
      return NextResponse.json({ messages: [] }, { headers: corsHeaders(origin!) });
    }

    const since = searchParams.get("since");
    let sinceDate: Date | undefined;
    if (since) {
      sinceDate = new Date(since);
      if (isNaN(sinceDate.getTime())) sinceDate = undefined;
    }

    const messages = await prisma.channelMessage.findMany({
      where: { conversationId: conversation.id, ...(sinceDate ? { timestamp: { gt: sinceDate } } : {}) },
      select: { id: true, direction: true, body: true, timestamp: true, interactivePayload: true },
      orderBy: { timestamp: "asc" },
      take: 100,
    });

    return NextResponse.json({ messages }, { headers: corsHeaders(origin!) });
  } catch (error) {
    const message = publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
