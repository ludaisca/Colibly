import { NextResponse } from "next/server";
import { createHash } from "crypto";
import type { Channel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { compareMetaSignature } from "@/lib/meta/webhook-signature";
import { fetchInstagramPermalink, fetchUserProfile } from "@/lib/meta-messaging";
import { getMetaPlatformApp, verifyTokenMatches } from "@/lib/meta/platform-app";
import { getMetaChannelCredentials } from "@/lib/meta-messaging/send";
import { ingestChannelMessage } from "@/lib/telegram/ingest-message";
import { resolveInboundExternalId } from "@/lib/meta-messaging/comment-reply";

// Webhook COMPARTIDO para Messenger e Instagram — mismo shape de payload
// (entry[].messaging[]) bajo el modelo Página-vinculada, solo cambia
// `object` ("page" vs "instagram") y por tanto qué ChannelAccount buscar.
// A diferencia de Telegram (URL por cuenta, [accountId] en el path), Meta
// entrega TODOS sus webhooks de mensajería a una sola URL de callback por
// App — la cuenta se resuelve por entry[].id (Page ID o IG Business ID)
// contra ChannelAccount.externalAccountId, igual que app/api/meta/webhook/
// leadgen/route.ts resuelve por pageId.

interface MessagingAttachment {
  type: string; // "image" | "video" | "audio" | "file" | ...
  payload?: { url?: string };
}

interface MessagingEvent {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: {
    mid: string;
    text?: string;
    attachments?: MessagingAttachment[];
    // Toque de un quick reply (automatizaciones / API): payload = id de opción.
    quick_reply?: { payload?: string };
    // Eco de un mensaje que NOSOTROS mandamos — ya se crea el ChannelMessage
    // OUTBOUND de forma síncrona al enviar (ver lib/meta-messaging/send.ts),
    // ingerir el eco también duplicaría el mensaje como si fuera INBOUND.
    is_echo?: boolean;
  };
}

// Roadmap P3-c — evento de comentario en una publicación de Facebook Page
// (webhook field "feed", suscrito junto con "messages" en
// subscribePageToApp). Payload distinto al de mensajería: no hay
// sender/recipient, sino post_id/comment_id + from{id,name} + message.
interface FeedCommentValue {
  item: string; // "comment" | "post" | "reaction" | ... — solo "comment" interesa aquí
  verb: string; // "add" | "edited" | "remove" — solo "add" interesa aquí (mensajes nuevos)
  comment_id: string;
  post_id: string;
  created_time: number; // epoch en SEGUNDOS, no ms (a diferencia de MessagingEvent.timestamp)
  message?: string;
  from?: { id: string; name?: string };
}

interface FeedChangeEvent {
  field: string;
  value: FeedCommentValue;
}

// Comentario de Instagram (field "comments" del objeto instagram). El id es el
// del comentario; from.id el del comentarista (IGSID) y media.id la
// publicación o reel. Meta no manda la fecha: se usa la del entry.
interface InstagramCommentValue {
  id: string;
  text?: string;
  from?: { id: string; username?: string };
  media?: { id: string; media_product_type?: string };
  parent_id?: string;
}

interface MessagingEntry {
  id: string;
  time: number;
  messaging?: MessagingEvent[];
  changes?: Array<FeedChangeEvent | { field: string; value: InstagramCommentValue }>;
}

interface MessagingWebhookBody {
  object: string; // "page" (Messenger) | "instagram"
  entry?: MessagingEntry[];
}

interface ExtractedMessageInfo {
  type: string;
  body: string;
  // Para Messenger/Instagram esto es la URL directa y ya fetcheable del
  // adjunto (CDN firmada de Meta) — a diferencia del file_id de Telegram,
  // no hace falta un getFileUrl() separado; media-worker.ts hace fetch(url)
  // directo usando este mismo valor como mediaId.
  mediaId: string | null;
  mimeType: string | null;
  caption: string | null;
}

function extractMessageInfo(message: NonNullable<MessagingEvent["message"]>): ExtractedMessageInfo {
  const attachment = message.attachments?.[0];
  if (attachment?.payload?.url) {
    const type =
      attachment.type === "image" ? "image" : attachment.type === "video" ? "video" : attachment.type === "audio" ? "audio" : "document";
    const mimeType =
      type === "image" ? "image/jpeg" : type === "video" ? "video/mp4" : type === "audio" ? "audio/mpeg" : "application/octet-stream";
    return { type, body: message.text ?? `[${type}]`, mediaId: attachment.payload.url, mimeType, caption: message.text ?? null };
  }
  return { type: "text", body: message.text ?? "", mediaId: null, mimeType: null, caption: null };
}

function channelFromObject(object: string): Channel | null {
  if (object === "page") return "MESSENGER";
  if (object === "instagram") return "INSTAGRAM";
  return null;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode !== "subscribe" || !token || !challenge) {
    return new NextResponse("Bad Request", { status: 400 });
  }

  // Primero el token de la app de plataforma (cuentas conectadas con
  // "Conectar con Facebook", un solo webhook para todas); luego el de cada
  // cuenta manual.
  if (verifyTokenMatches(token, (await getMetaPlatformApp()).webhookVerifyToken)) {
    return new NextResponse(challenge, { headers: { "Content-Type": "text/plain" } });
  }

  const hash = createHash("sha256").update(token).digest("hex");

  // El handshake GET no trae entry[].id — no hay forma de saber de antemano
  // si es para una cuenta de Messenger o de Instagram, así que se busca en
  // ambos canales por el hash del verify_token.
  const account = await prisma.channelAccount.findFirst({
    where: { channel: { in: ["MESSENGER", "INSTAGRAM"] }, verifyTokenHash: hash, status: { not: "DISCONNECTED" } },
  });

  if (!account) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  return new NextResponse(challenge, { headers: { "Content-Type": "text/plain" } });
}

export async function POST(req: Request) {
  try {
    const forwarded = req.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() ?? "unknown";
    // Límite alto a propósito: todo el tráfico legítimo de Meta llega desde
    // pocas IPs y compartido por todas las cuentas (una campaña de 1,000
    // mensajes genera ~3,000 callbacks de estado). La autenticación real es la
    // firma HMAC de cada payload.
    const { allowed } = await rateLimit(`meta-messaging-webhook:${ip}`, 3000, 60);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const rawBody = await req.text();
    let body: MessagingWebhookBody;
    try {
      body = JSON.parse(rawBody) as MessagingWebhookBody;
    } catch {
      // Malformado: reintentar no lo arregla.
      return NextResponse.json({ success: true });
    }
    const signature = req.headers.get("x-hub-signature-256");

    const channel = channelFromObject(body.object);
    if (!channel) {
      return NextResponse.json({ success: true });
    }

    let platformSecret: string | null | undefined;
    for (const entry of body.entry ?? []) {
      const account = await prisma.channelAccount.findUnique({
        where: { channel_externalAccountId: { channel, externalAccountId: entry.id } },
      });
      if (!account) continue;

      const credentials = getMetaChannelCredentials(account);
      // Cuenta conectada con la app de Colibly: la firma es con el App Secret
      // de la plataforma; una manual, con el de la app del cliente. Nunca al revés.
      const secret = credentials.connection === "platform" ? (platformSecret ??= (await getMetaPlatformApp()).appSecret) : credentials.appSecret;
      const sigValid = compareMetaSignature(rawBody, signature, secret ?? undefined);
      if (!sigValid) continue;

      await prisma.channelAccount.update({ where: { id: account.id }, data: { lastActivity: new Date() } });

      for (const event of entry.messaging ?? []) {
        if (!event.message || event.message.is_echo) continue;

        const info = extractMessageInfo(event.message);
        const senderId = event.sender.id;

        await ingestChannelMessage(account.id, channel, {
          // Si este id lo aprendió una respuesta privada a un comentario, el DM
          // entra a la conversación de ese comentario.
          externalId: await resolveInboundExternalId(account.id, senderId),
          externalMessageId: event.message.mid,
          timestamp: new Date(event.timestamp),
          type: info.type,
          body: info.body,
          // Messenger/Instagram no mandan el nombre en el webhook — se pide
          // vía Graph API, y solo si el contacto es realmente nuevo (ver
          // lib/telegram/ingest-message.ts).
          contactName: async () => {
            const profile = await fetchUserProfile(credentials.pageAccessToken, senderId);
            return profile.name ?? senderId;
          },
          isGroup: false,
          interactiveReplyId: event.message.quick_reply?.payload ?? null,
          mediaId: info.mediaId,
          mimeType: info.mimeType,
          caption: info.caption,
        });
      }

      // Comentarios de la Página (publicaciones y anuncios; Meta manda los de
      // anuncios por el mismo field). Solo Facebook: Instagram usa otro field
      // (`comments`) que todavía no se procesa — docs/arquitectura/canales.md.
      if (channel === "MESSENGER") {
        for (const change of entry.changes ?? []) {
          if (change.field !== "feed") continue;
          const value = change.value as FeedCommentValue;
          // "edited"/"remove" y cualquier item que no sea "comment" (post,
          // reaction, ...) se ignoran — solo comentarios nuevos abren
          // conversación.
          if (value.item !== "comment" || value.verb !== "add" || !value.from) continue;
          // Comentarios publicados por la PROPIA Página (respuestas del
          // community manager desde Facebook) llegan por el mismo webhook —
          // sin este filtro se creaba un contacto/conversación con la Página
          // como si fuera un lead.
          if (value.from.id === entry.id || value.from.id === account.externalAccountId) continue;

          await ingestChannelMessage(account.id, channel, {
            externalId: value.from.id,
            externalMessageId: value.comment_id,
            timestamp: new Date(value.created_time * 1000),
            type: "text",
            body: value.message ?? "",
            // A diferencia de mensajería, Meta SÍ manda el nombre inline en
            // el evento de comentario — sin necesidad de golpear la Graph
            // API para pedirlo (ver contactName en ingest-message.ts).
            contactName: value.from.name ?? value.from.id,
            isGroup: false,
            isFromComment: true,
            commentPostId: value.post_id ?? null,
          });
        }
      }

      // Comentarios de Instagram (publicaciones, reels y anuncios): field
      // "comments" del objeto instagram (permiso instagram_manage_comments).
      if (channel === "INSTAGRAM") {
        for (const change of entry.changes ?? []) {
          if (change.field !== "comments") continue;
          const value = change.value as InstagramCommentValue;
          if (!value?.id || !value.from?.id) continue;
          // Respuestas de la propia cuenta (desde la app o desde aquí): no son un lead.
          if (value.from.id === entry.id || value.from.id === account.externalAccountId) continue;
          const mediaId = value.media?.id ?? null;
          const entryMs = entry.time > 1e12 ? entry.time : entry.time * 1000;

          await ingestChannelMessage(account.id, channel, {
            externalId: await resolveInboundExternalId(account.id, value.from.id),
            externalMessageId: value.id,
            timestamp: Number.isFinite(entryMs) && entryMs > 0 ? new Date(entryMs) : new Date(),
            type: "text",
            body: value.text ?? "",
            contactName: value.from.username ? `@${value.from.username}` : value.from.id,
            isGroup: false,
            isFromComment: true,
            // El permalink (https://www.instagram.com/p/…) para enlazarlo desde el
            // chat; si Meta no lo da, nada (un id de media solo no sirve de enlace).
            commentPostId: mediaId ? await fetchInstagramPermalink(credentials.pageAccessToken, mediaId).catch(() => null) : null,
          });
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[meta messaging webhook] Error:", error);
    // Error procesando un payload ya parseado (DB/Redis caídos, Graph API...):
    // 500 para que Meta reintente — antes se respondía 200 y el mensaje se
    // perdía para siempre. El dedup por externalMessageId hace seguro el
    // reintento. Payloads inválidos o sin firma válida siguen respondiendo 200.
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
