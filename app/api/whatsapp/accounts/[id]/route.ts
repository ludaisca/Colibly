import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { waAccountUpdateSchema } from "@/lib/validations";
import { encrypt, hashToken } from "@/lib/crypto";
import { validateToken } from "@/lib/whatsapp";
import { rateLimit } from "@/lib/rate-limit";
import { forbidRoles } from "@/lib/roles";
import { publicErrorMessage } from "@/lib/api-errors";
import { accountManageWhere } from "@/lib/tenancy";
import { getUserAccountIds, invalidateAccountScopes } from "@/lib/shared-accounts";
import { whatsappWebhookUrl } from "@/lib/whatsapp/webhook-url";
import { refreshPhoneHealth } from "@/lib/whatsapp/phone-health";
import { configureWelcomeMessage, WELCOME_TEXT_MAX, WelcomeConfigError } from "@/lib/whatsapp/welcome";
import { MetaAdminError } from "@/lib/whatsapp/account-admin";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;

    if (!(await getUserAccountIds(session.user.id)).includes(id)) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    }
    const account = await prisma.wAAccount.findFirst({
      where: {
        id,
      },
      select: {
        id: true,
        userId: true,
        owner: { select: { id: true, name: true, email: true, license: true, disabledAt: true } },
        name: true,
        channel: true,
        phoneNumber: true,
        phoneNumberId: true,
        wabaId: true,
        appId: true,
        status: true,
        errorMessage: true,
        lastActivity: true,
        autoAssignEnabled: true,
        autoAssignOnlineOnly: true,
        csatEnabled: true,
        welcomeMessageEnabled: true,
        welcomeMessageText: true,
        qualityRating: true,
        messagingTier: true,
        qualityUpdatedAt: true,
        qualityEvent: true,
        nameStatus: true,
        canSendMessage: true,
        healthNotices: true,
        healthCheckedAt: true,
        appSecret: true,
        connectionType: true,
        coexistence: true,
        callingEnabled: true,
        syncStatus: true,
        syncProgress: true,
        syncDeadlineAt: true,
        syncError: true,
        historySkippedChats: true,
        historySkippedMessages: true,
        tokenExpiresAt: true,
        disconnectedReason: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { chats: true, templates: true } },
      },
    });

    if (!account) {
      return NextResponse.json(
        { error: "Cuenta no encontrada" },
        { status: 404 }
      );
    }

    // Salud del número desde Graph (caché de 10 min): si se refrescó, se
    // devuelve lo recién leído.
    if (await refreshPhoneHealth(account.id)) {
      const health = await prisma.wAAccount.findUnique({
        where: { id: account.id },
        select: { qualityRating: true, messagingTier: true, qualityUpdatedAt: true, nameStatus: true, canSendMessage: true, healthNotices: true, healthCheckedAt: true },
      });
      if (health) Object.assign(account, health);
    }

    // Nunca se devuelve el secreto (ni cifrado) — solo si está configurado,
    // para que la UI avise que sin él el webhook descarta todo.
    // Las cuentas de Embedded Signup se firman con el App Secret de la
    // plataforma: no tienen secreto propio y no deben marcarse como "sin secreto".
    const { appSecret, ...rest } = account;
    const usesPlatformApp = account.connectionType === "EMBEDDED_SIGNUP";
    return NextResponse.json({ ...rest, usesPlatformApp, hasAppSecret: usesPlatformApp || !!appSecret, webhookUrl: whatsappWebhookUrl(req.url) });
  } catch (error) {
    const message =
      publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const denied = forbidRoles(session, ["ejecutivo"]);
    if (denied) return denied;

    const { allowed } = await rateLimit(`account-mutate:${session.user.id}`, 20, 60);
    if (!allowed) {
      return NextResponse.json({ error: "Demasiadas solicitudes, espera un momento" }, { status: 429 });
    }

    const { id } = await params;

    const existing = await prisma.wAAccount.findFirst({
      where: { id, ...(await accountManageWhere(session.user.id)) },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Cuenta no encontrada" },
        { status: 404 }
      );
    }

    const body = await req.json().catch(() => null);
    const parsed = waAccountUpdateSchema.safeParse(body);

    if (!parsed.success) {
      const message = parsed.error.issues[0].message;
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    const { name, accessToken, verifyToken, appSecret, wabaId, appId } = parsed.data;

    if (name) data.name = name;
    if (wabaId !== undefined) data.wabaId = wabaId || null;
    if (appId !== undefined) data.appId = appId || null;

    if (typeof body?.autoAssignEnabled === "boolean") {
      data.autoAssignEnabled = body.autoAssignEnabled;
    }
    if (typeof body?.autoAssignOnlineOnly === "boolean") {
      data.autoAssignOnlineOnly = body.autoAssignOnlineOnly;
    }
    if (typeof body?.csatEnabled === "boolean") {
      data.csatEnabled = body.csatEnabled;
    }

    // Mensaje de bienvenida: se activa también en Meta (lib/whatsapp/welcome.ts).
    const welcome = body?.welcomeMessage as { enabled?: unknown; text?: unknown } | undefined;
    if (welcome !== undefined) {
      if (typeof welcome?.enabled !== "boolean" || (welcome.text !== undefined && welcome.text !== null && typeof welcome.text !== "string")) {
        return NextResponse.json({ error: "welcomeMessage necesita enabled (sí/no) y un texto opcional" }, { status: 400 });
      }
      if (typeof welcome.text === "string" && welcome.text.trim().length > WELCOME_TEXT_MAX) {
        return NextResponse.json({ error: `El mensaje de bienvenida admite máximo ${WELCOME_TEXT_MAX} caracteres` }, { status: 400 });
      }
      try {
        await configureWelcomeMessage(existing, { enabled: welcome.enabled, text: welcome.text as string | null | undefined });
      } catch (err) {
        if (err instanceof WelcomeConfigError) return NextResponse.json({ error: err.message }, { status: 400 });
        if (err instanceof MetaAdminError) return NextResponse.json({ error: `Meta: ${err.message}` }, { status: 502 });
        throw err;
      }
    }

    if (accessToken) {
      if (existing.channel !== "META_CLOUD" || !existing.phoneNumberId) {
        return NextResponse.json(
          { error: "El token de acceso solo aplica a cuentas de Meta Cloud API" },
          { status: 400 }
        );
      }
      await validateToken(existing.phoneNumberId, accessToken);
      data.accessToken = encrypt(accessToken);
    }

    if (verifyToken) {
      data.verifyTokenHash = hashToken(verifyToken);
    }

    if (appSecret) {
      data.appSecret = encrypt(appSecret);
    }

    const updated = await prisma.wAAccount.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        channel: true,
        phoneNumber: true,
        phoneNumberId: true,
        wabaId: true,
        appId: true,
        status: true,
        errorMessage: true,
        lastActivity: true,
        autoAssignEnabled: true,
        autoAssignOnlineOnly: true,
        csatEnabled: true,
        welcomeMessageEnabled: true,
        welcomeMessageText: true,
        appSecret: true,
        connectionType: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const { appSecret: storedSecret, ...updatedRest } = updated;
    return NextResponse.json({ ...updatedRest, hasAppSecret: updated.connectionType === "EMBEDDED_SIGNUP" || !!storedSecret });
  } catch (error) {
    const message =
      publicErrorMessage(error, "Error interno del servidor");
    const status = message.includes("Token validation failed") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const denied = forbidRoles(session, ["ejecutivo"]);
    if (denied) return denied;

    const { allowed } = await rateLimit(`account-mutate:${session.user.id}`, 20, 60);
    if (!allowed) {
      return NextResponse.json({ error: "Demasiadas solicitudes, espera un momento" }, { status: 429 });
    }

    const { id } = await params;

    const existing = await prisma.wAAccount.findFirst({
      where: { id, ...(await accountManageWhere(session.user.id)) },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Cuenta no encontrada" },
        { status: 404 }
      );
    }


    await prisma.wAAccount.delete({ where: { id } });
    invalidateAccountScopes();

    return NextResponse.json({ success: true });
  } catch (error) {
    const message =
      publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
