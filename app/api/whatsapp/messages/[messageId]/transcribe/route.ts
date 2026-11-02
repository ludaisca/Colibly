import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserAccountIds, getUserChannelAccountIds } from "@/lib/shared-accounts";
import { rateLimit } from "@/lib/rate-limit";
import { publicErrorMessage } from "@/lib/api-errors";
import { BILLING_PLAN_PATH } from "@/lib/billing/gates";
import { TranscribeError, transcribeMessage, type TranscribeErrorCode } from "@/lib/ai/transcribe";

// Transcribir una nota de voz (WhatsApp o canal genérico: el id se busca en
// las dos tablas, como la ruta de media). Mismo alcance que el medio: si el
// usuario puede escuchar el audio, puede transcribirlo. Idempotente: un
// mensaje ya transcrito responde sin gastar crédito.

const STATUS: Record<TranscribeErrorCode, number> = {
  not_found: 404,
  not_audio: 400,
  no_media: 409,
  too_large: 413,
  unavailable: 503,
  no_access: 402,
  ai_credits: 402,
  empty: 502,
};

export async function POST(_req: Request, { params }: { params: Promise<{ messageId: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { messageId } = await params;

    const wa = await prisma.wAMessage.findFirst({
      where: { id: messageId, chat: { accountId: { in: await getUserAccountIds(session.user.id) } } },
      select: { id: true, transcript: true },
    });
    const channel = wa
      ? null
      : await prisma.channelMessage.findFirst({
          where: { id: messageId, conversation: { channelAccountId: { in: await getUserChannelAccountIds(session.user.id) } } },
          select: { id: true, transcript: true },
        });
    const found = wa ?? channel;
    if (!found) return NextResponse.json({ error: "Mensaje no encontrado" }, { status: 404 });
    if (found.transcript) return NextResponse.json({ transcript: found.transcript });

    if (!(await rateLimit(`transcribe:${session.user.id}`, 20, 60)).allowed) {
      return NextResponse.json({ error: "Espera un momento antes de transcribir más audios" }, { status: 429 });
    }

    try {
      const transcript = await transcribeMessage(wa ? "whatsapp" : "channel", found.id, { userId: session.user.id });
      return NextResponse.json({ transcript });
    } catch (error) {
      if (!(error instanceof TranscribeError)) throw error;
      const body: Record<string, unknown> = { error: error.message };
      if (error.code === "ai_credits") body.code = "ai_credits";
      if (error.code === "no_access") Object.assign(body, { code: "plan_limit", limit: "aiAccess", actionUrl: BILLING_PLAN_PATH });
      return NextResponse.json(body, { status: STATUS[error.code] });
    }
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "No se pudo transcribir el audio") }, { status: 500 });
  }
}
