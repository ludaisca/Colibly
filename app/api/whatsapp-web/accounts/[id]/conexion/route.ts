import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { publicErrorMessage } from "@/lib/api-errors";
import { accountManageWhere } from "@/lib/tenancy";
import { forbidRoles } from "@/lib/roles";
import { isChannelEnabled } from "@/lib/channel-flags";
import { whatsappWebPairingSchema } from "@/lib/validations";
import { readGowaCredentials } from "@/lib/gowa/account";
import { getLoginQr, getPairingCode } from "@/lib/gowa/client";
import { syncGowaLink } from "@/lib/gowa/lifecycle";

// Vinculación del número. La pantalla consulta este GET con usePoll(): si el
// número ya está vinculado responde CONNECTED; si no, PENDING. Con ?qr=1 pide
// además un QR nuevo (data URL: el PNG nunca sale de GoWA directo al
// navegador) — solo al abrir y cuando el anterior vence, para no reiniciar el
// emparejamiento a mitad de un escaneo. POST {phone} pide un código de 8
// caracteres para vincular sin escanear.

async function loadAccount(userId: string, id: string) {
  return prisma.channelAccount.findFirst({
    where: { id, channel: "WHATSAPP_WEB", ...(await accountManageWhere(userId)) },
  });
}

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const forbidden = forbidRoles(session, ["ejecutivo"]);
    if (forbidden) return forbidden;
    const { allowed } = await rateLimit(`gowa-link:${session.user.id}`, 60, 60);
    if (!allowed) return NextResponse.json({ error: "Demasiadas solicitudes, espera un momento" }, { status: 429 });

    const { id } = await params;
    const account = await loadAccount(session.user.id, id);
    if (!account) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    if (!(await isChannelEnabled(account.organizationId, "WHATSAPP_WEB"))) {
      return NextResponse.json({ error: "WhatsApp por QR está desactivado para tu organización", code: "channel_disabled" }, { status: 403 });
    }

    let state;
    try {
      state = await syncGowaLink(account);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return NextResponse.json({ error: "Ese número ya está conectado en otra cuenta. Bórrala o desvincula el número primero." }, { status: 409 });
      }
      throw error;
    }
    if (state.status === "CONNECTED") return NextResponse.json(state, { headers: NO_STORE });

    if (new URL(req.url).searchParams.get("qr") !== "1") return NextResponse.json({ status: "PENDING" }, { headers: NO_STORE });
    const { deviceId } = readGowaCredentials(account);
    const qr = await getLoginQr(deviceId);
    return NextResponse.json({ status: "PENDING", qr: qr.dataUrl, expiresInSeconds: qr.expiresInSeconds }, { headers: NO_STORE });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "No se pudo consultar la conexión") }, { status: 502 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const forbidden = forbidRoles(session, ["ejecutivo"]);
    if (forbidden) return forbidden;
    const { allowed } = await rateLimit(`gowa-pair-code:${session.user.id}`, 5, 300);
    if (!allowed) return NextResponse.json({ error: "Demasiados intentos, espera unos minutos" }, { status: 429 });

    const { id } = await params;
    const account = await loadAccount(session.user.id, id);
    if (!account) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    if (!(await isChannelEnabled(account.organizationId, "WHATSAPP_WEB"))) {
      return NextResponse.json({ error: "WhatsApp por QR está desactivado para tu organización", code: "channel_disabled" }, { status: 403 });
    }
    const parsed = whatsappWebPairingSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

    const { deviceId } = readGowaCredentials(account);
    const code = await getPairingCode(deviceId, parsed.data.phone.replace(/^\+/, ""));
    return NextResponse.json({ code }, { headers: NO_STORE });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "No se pudo generar el código") }, { status: 502 });
  }
}
