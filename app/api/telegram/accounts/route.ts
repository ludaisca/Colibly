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
import { claimChannelOwner } from "@/lib/billing/user-license";
import { invalidateAccountScopes } from "@/lib/shared-accounts";
import { requireVerifiedEmail } from "@/lib/auth-emails";
import { checkPlanLimit } from "@/lib/billing/gates";
import { assertChannelEnabled } from "@/lib/channel-flags";
import { forbidRoles } from "@/lib/roles";
import { channelAccountsGET } from "@/lib/channels/routes";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    // "ejecutivo" tiene /telegram/cuentas bloqueado en proxy.ts; este 403 cierra la API directa.
    const forbidden = forbidRoles(session, ["ejecutivo"]);
    if (forbidden) return forbidden;

    const unverified = await requireVerifiedEmail(session.user.id);
    if (unverified) return unverified;
    const organizationId = await requireOrgId(session.user.id);
    const channelDisabled = await assertChannelEnabled(organizationId, "TELEGRAM");
    if (channelDisabled) return channelDisabled;
    const overLimit = await checkPlanLimit(organizationId, "telegram");
    if (overLimit) return overLimit;

    const { allowed } = await rateLimit(`channel-account-create:${session.user.id}`, 10, 60);
    if (!allowed) {
      return NextResponse.json({ error: "Demasiadas solicitudes, espera un momento" }, { status: 429 });
    }

    const body = await req.json().catch(() => null);
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
    invalidateAccountScopes();
    await claimChannelOwner("channel", account.id, session.user.id);

    // El navegador puede estar en un puerto que Telegram no acepta (1443).
    // El webhook usa la URL pública HTTPS: el override del túnel, si no APP_URL.
    const origin = (process.env.TELEGRAM_WEBHOOK_BASE_URL || process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");
    try {
      const webhookUrl = new URL(`/api/telegram/webhook/${account.id}`, origin);
      if (webhookUrl.protocol !== "https:") {
        throw new Error("Telegram requiere una URL pública HTTPS para el webhook");
      }
      if (webhookUrl.port && !["80", "88", "443", "8443"].includes(webhookUrl.port)) {
        throw new Error("Telegram solo acepta el webhook en el puerto 443 o 8443");
      }
      await setWebhook(botToken, webhookUrl.toString(), webhookSecret);
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

// GET abierto a todos los roles: el rail de cuentas de la bandeja (lib/channels/routes.ts).
export const GET = channelAccountsGET("TELEGRAM");
