import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { telegramAccountSchema } from "@/lib/validations";
import { encrypt } from "@/lib/crypto";
import { getMe, setWebhook } from "@/lib/telegram";
import { rateLimit } from "@/lib/rate-limit";
import { publicErrorMessage } from "@/lib/api-errors";
import { requireOrgId } from "@/lib/tenancy";
import { getUserChannelAccountIds } from "@/lib/shared-accounts";
import { requireVerifiedEmail } from "@/lib/auth-emails";
import { checkPlanLimit } from "@/lib/billing/gates";
import { assertChannelEnabled } from "@/lib/channel-flags";

// El rol "ejecutivo" tiene /telegram/cuentas bloqueado en proxy.ts — este 403
// cierra el acceso directo a la API (defensa en profundidad, mismo patrón que
// /api/usuarios y /api/whatsapp/contacts). "user" sí administra cuentas, igual
// que en WhatsApp.
function isForbiddenRole(role: string | undefined): boolean {
  return role === "ejecutivo";
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (isForbiddenRole(session.user.role)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const unverified = await requireVerifiedEmail(session.user.id);
    if (unverified) return unverified;
    const organizationId = await requireOrgId(session.user.id);
    const channelDisabled = await assertChannelEnabled(organizationId, "TELEGRAM");
    if (channelDisabled) return channelDisabled;
    const overLimit = await checkPlanLimit(organizationId, "channels");
    if (overLimit) return overLimit;

    const { allowed } = await rateLimit(`channel-account-create:${session.user.id}`, 10, 60);
    if (!allowed) {
      return NextResponse.json({ error: "Demasiadas solicitudes, espera un momento" }, { status: 429 });
    }

    const body = await req.json();
    const parsed = telegramAccountSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { name, botToken } = parsed.data;

    const botInfo = await getMe(botToken);

    const webhookSecret = randomBytes(24).toString("hex");
    const credentials = encrypt(JSON.stringify({ botToken, webhookSecret }));

    const account = await prisma.channelAccount.create({
      data: {
        userId: session.user.id,
        organizationId,
        channel: "TELEGRAM",
        name,
        credentials,
        status: "PENDING",
      },
      select: { id: true, name: true, channel: true, status: true, createdAt: true },
    });

    const origin = new URL(req.url).origin;
    try {
      await setWebhook(botToken, `${origin}/api/telegram/webhook/${account.id}`, webhookSecret);
      const connected = await prisma.channelAccount.update({
        where: { id: account.id },
        data: { status: "CONNECTED", lastActivity: new Date() },
        select: { id: true, name: true, channel: true, status: true, createdAt: true },
      });
      return NextResponse.json({ ...connected, botUsername: botInfo.username }, { status: 201 });
    } catch (webhookError) {
      const message = webhookError instanceof Error ? webhookError.message : "Error al configurar el webhook";
      await prisma.channelAccount.update({
        where: { id: account.id },
        data: { status: "ERROR", errorMessage: message },
      });
      return NextResponse.json({ error: `Bot validado pero falló la conexión del webhook: ${message}` }, { status: 502 });
    }
  } catch (error) {
    const message = publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GET queda abierto a todos los roles a propósito (igual que
// /api/whatsapp/accounts): chat-workspace.tsx lo usa para armar el rail de
// cuentas del inbox, al que "ejecutivo" sí tiene acceso. Lo que se restringe
// es crear/eliminar cuentas, no listarlas.
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const accounts = await prisma.channelAccount.findMany({
      // Propias + compartidas: editar/eliminar sigue siendo solo del dueño.
      where: { channel: "TELEGRAM", id: { in: await getUserChannelAccountIds(session.user.id) } },
      select: {
        id: true,
        userId: true,
        name: true,
        channel: true,
        status: true,
        errorMessage: true,
        lastActivity: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { conversations: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json(accounts);
  } catch (error) {
    const message = publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
