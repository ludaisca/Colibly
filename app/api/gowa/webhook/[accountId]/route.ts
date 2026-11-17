import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { isChannelEnabled } from "@/lib/channel-flags";
import { readGowaCredentials } from "@/lib/gowa/account";
import { gowaSignatureValid, parseGowaEvent, type GowaEnvelope } from "@/lib/gowa/webhook";
import { handleGowaEvent } from "@/lib/gowa/ingest";

// Eventos de GoWA para UNA cuenta WHATSAPP_WEB. La URL identifica la cuenta
// (como Telegram) y la autenticación es el HMAC del cuerpo con el secreto de
// ESA cuenta (X-Hub-Signature-256), más el device_id/session_id que debe
// coincidir con el de sus credenciales. GoWA reintenta (5 veces, backoff) ante
// un 5xx: el dedup por (conversación, id de mensaje) hace seguro el reintento.

export async function POST(req: Request, { params }: { params: Promise<{ accountId: string }> }) {
  try {
    const { accountId } = await params;
    const { allowed } = await rateLimit(`gowa-webhook:${accountId}`, 3000, 60);
    if (!allowed) return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });

    const account = await prisma.channelAccount.findUnique({ where: { id: accountId } });
    if (!account || account.channel !== "WHATSAPP_WEB") {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    }

    const raw = await req.text();
    const creds = readGowaCredentials(account);
    if (!gowaSignatureValid(raw, req.headers.get("x-hub-signature-256"), creds.webhookSecret)) {
      const failures = await rateLimit(`gowa-webhook-bad-signature:${accountId}`, 30, 60);
      return NextResponse.json({ error: "Firma inválida" }, { status: failures.allowed ? 401 : 429 });
    }

    let envelope: GowaEnvelope;
    try {
      envelope = JSON.parse(raw) as GowaEnvelope;
    } catch {
      return NextResponse.json({ ok: true }); // malformado: reintentar no lo arregla
    }
    // Un device ajeno con el mismo secreto no puede pasar por esta cuenta.
    if (envelope.session_id && envelope.session_id !== creds.deviceId) {
      return NextResponse.json({ error: "Device incorrecto" }, { status: 401 });
    }

    // Canal apagado por el operador: se descarta (200, para que GoWA no reintente).
    if (!(await isChannelEnabled(account.organizationId, "WHATSAPP_WEB"))) return NextResponse.json({ ok: true });

    await handleGowaEvent(account, parseGowaEvent(envelope));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[gowa webhook] error:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
