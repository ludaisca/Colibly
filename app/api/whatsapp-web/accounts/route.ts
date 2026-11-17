import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { whatsappWebAccountSchema } from "@/lib/validations";
import { rateLimit } from "@/lib/rate-limit";
import { publicErrorMessage } from "@/lib/api-errors";
import { requireOrgId } from "@/lib/tenancy";
import { claimChannelOwner } from "@/lib/billing/user-license";
import { getUserChannelAccountIds, invalidateAccountScopes } from "@/lib/shared-accounts";
import { requireVerifiedEmail } from "@/lib/auth-emails";
import { assertChannelEnabled, isChannelEnabled } from "@/lib/channel-flags";
import { forbidRoles } from "@/lib/roles";
import { createDevice, isGowaConfigured } from "@/lib/gowa/client";
import { encryptGowaCredentials, gowaWebhookUrl, newGowaCredentials } from "@/lib/gowa/account";

// WhatsApp por QR (GoWA, no oficial). Solo existe para organizaciones con
// channelWhatsappWebEnabled (lo enciende el operador): sin la bandera, crear y
// listar responden como si el canal no existiera. Sin límite de plan propio:
// el operador decide quién lo tiene. Detalle: docs/arquitectura/canales.md.

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const forbidden = forbidRoles(session, ["ejecutivo"]);
    if (forbidden) return forbidden;

    const unverified = await requireVerifiedEmail(session.user.id);
    if (unverified) return unverified;
    const organizationId = await requireOrgId(session.user.id);
    const channelDisabled = await assertChannelEnabled(organizationId, "WHATSAPP_WEB");
    if (channelDisabled) return channelDisabled;
    if (!isGowaConfigured()) {
      return NextResponse.json({ error: "WhatsApp por QR no está disponible en este servidor" }, { status: 503 });
    }

    const { allowed } = await rateLimit(`channel-account-create:${session.user.id}`, 10, 60);
    if (!allowed) return NextResponse.json({ error: "Demasiadas solicitudes, espera un momento" }, { status: 429 });

    const parsed = whatsappWebAccountSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

    const account = await prisma.channelAccount.create({
      data: {
        userId: session.user.id,
        organizationId,
        channel: "WHATSAPP_WEB",
        name: parsed.data.name,
        // Se reemplaza en cuanto existe el id de la cuenta (el device lo usa).
        credentials: encryptGowaCredentials({ deviceId: "", webhookSecret: "" }),
        status: "PENDING",
      },
      select: { id: true },
    });

    const creds = newGowaCredentials(account.id.slice(-10));
    try {
      await createDevice({ deviceId: creds.deviceId, webhookUrl: gowaWebhookUrl(account.id), webhookSecret: creds.webhookSecret });
    } catch (error) {
      await prisma.channelAccount.delete({ where: { id: account.id } });
      return NextResponse.json({ error: `No se pudo preparar la conexión: ${publicErrorMessage(error, "GoWA no respondió")}` }, { status: 502 });
    }

    const saved = await prisma.channelAccount.update({
      where: { id: account.id },
      data: { credentials: encryptGowaCredentials(creds) },
      select: { id: true, name: true, channel: true, status: true, createdAt: true },
    });
    invalidateAccountScopes();
    await claimChannelOwner("channel", saved.id, session.user.id);
    return NextResponse.json(saved, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}

// Abierto a todos los roles (como /api/telegram/accounts): el rail de cuentas
// de la bandeja lo usa. Con el canal apagado no lista nada.
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const organizationId = await requireOrgId(session.user.id);
    if (!(await isChannelEnabled(organizationId, "WHATSAPP_WEB"))) return NextResponse.json([]);

    const accounts = await prisma.channelAccount.findMany({
      where: { channel: "WHATSAPP_WEB", id: { in: await getUserChannelAccountIds(session.user.id) } },
      select: {
        id: true,
        userId: true,
        owner: { select: { id: true, name: true, email: true, license: true, disabledAt: true } },
        name: true,
        channel: true,
        status: true,
        errorMessage: true,
        externalAccountId: true,
        lastActivity: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { conversations: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json(accounts);
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}
