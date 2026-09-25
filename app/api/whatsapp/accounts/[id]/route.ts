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
import { getUserAccountIds } from "@/lib/shared-accounts";

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
        qualityRating: true,
        messagingTier: true,
        qualityUpdatedAt: true,
        appSecret: true,
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

    // Nunca se devuelve el secreto (ni cifrado) — solo si está configurado,
    // para que la UI avise que sin él el webhook descarta todo.
    const { appSecret, ...rest } = account;
    return NextResponse.json({ ...rest, hasAppSecret: !!appSecret });
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

    const body = await req.json();
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
        appSecret: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const { appSecret: storedSecret, ...updatedRest } = updated;
    return NextResponse.json({ ...updatedRest, hasAppSecret: !!storedSecret });
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

    return NextResponse.json({ success: true });
  } catch (error) {
    const message =
      publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
