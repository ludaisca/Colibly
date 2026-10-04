import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { metaAdsAccountUpdateSchema } from "@/lib/validations";
import { encrypt, hashToken } from "@/lib/crypto";
import { validatePageToken } from "@/lib/meta/validate-page-token";
import { rateLimit } from "@/lib/rate-limit";
import { publicErrorMessage } from "@/lib/api-errors";
import { orgWhere } from "@/lib/tenancy";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (session.user.role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { id } = await params;
    const account = await prisma.metaAdsAccount.findFirst({
      where: { id, ...(await orgWhere(session.user.id)) },
      select: {
        id: true,
        name: true,
        pageId: true,
        status: true,
        errorMessage: true,
        mode: true,
        testEventCode: true,
        datasetId: true,
        waAccountId: true,
        waAccount: { select: { id: true, name: true } },
        appSecret: true,
        capiAccessToken: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { contacts: true, conversionEvents: true } },
      },
    });

    if (!account) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    }

    const { appSecret, capiAccessToken, ...rest } = account;
    return NextResponse.json({ ...rest, hasAppSecret: !!appSecret, hasCapiAccessToken: !!capiAccessToken });
  } catch (error) {
    const message = publicErrorMessage(error, "Error interno del servidor");
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
    if (session.user.role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { allowed } = await rateLimit(`meta-account-mutate:${session.user.id}`, 20, 60);
    if (!allowed) {
      return NextResponse.json({ error: "Demasiadas solicitudes, espera un momento" }, { status: 429 });
    }

    const { id } = await params;
    const existing = await prisma.metaAdsAccount.findFirst({ where: { id, ...(await orgWhere(session.user.id)) } });
    if (!existing) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    }

    const body = await req.json();
    const parsed = metaAdsAccountUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { name, pageAccessToken, appSecret, verifyToken, datasetId, capiAccessToken, waAccountId, mode, testEventCode } =
      parsed.data;

    const data: Record<string, unknown> = {};
    if (name) data.name = name;
    if (datasetId !== undefined) data.datasetId = datasetId || null;
    if (testEventCode !== undefined) data.testEventCode = testEventCode || null;

    if (waAccountId !== undefined) {
      if (waAccountId) {
        const waAccount = await prisma.wAAccount.findFirst({ where: { id: waAccountId, ...(await orgWhere(session.user.id)) } });
        if (!waAccount) {
          return NextResponse.json({ error: "Cuenta de WhatsApp no encontrada" }, { status: 400 });
        }
      }
      data.waAccountId = waAccountId || null;
    }

    if (pageAccessToken) {
      await validatePageToken(existing.pageId, pageAccessToken);
      data.pageAccessToken = encrypt(pageAccessToken);
    }

    if (appSecret) {
      data.appSecret = encrypt(appSecret);
    }

    if (verifyToken) {
      data.verifyTokenHash = hashToken(verifyToken);
    }

    if (capiAccessToken !== undefined) {
      data.capiAccessToken = capiAccessToken ? encrypt(capiAccessToken) : null;
    }

    // LIVE sin Dataset ID o token parece activo en la UI, pero el worker
    // omite todos los eventos. También se valida al borrar credenciales.
    const effectiveMode = mode ?? existing.mode;
    const effectiveDataset = datasetId !== undefined ? datasetId.trim() : existing.datasetId;
    const hasCapiToken = capiAccessToken !== undefined ? !!capiAccessToken.trim() : !!existing.capiAccessToken;
    if (effectiveMode === "LIVE" && (!effectiveDataset || !hasCapiToken)) {
      return NextResponse.json({ error: "Para usar LIVE configura el Dataset ID y el token de Conversions API" }, { status: 400 });
    }
    // mode:LIVE solo llega cuando un admin lo confirma en el formulario.
    if (mode) data.mode = mode;

    const updated = await prisma.metaAdsAccount.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        pageId: true,
        status: true,
        mode: true,
        datasetId: true,
        waAccountId: true,
        testEventCode: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    const message = publicErrorMessage(error, "Error interno del servidor");
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
    if (session.user.role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { allowed } = await rateLimit(`meta-account-mutate:${session.user.id}`, 20, 60);
    if (!allowed) {
      return NextResponse.json({ error: "Demasiadas solicitudes, espera un momento" }, { status: 429 });
    }

    const { id } = await params;
    const existing = await prisma.metaAdsAccount.findFirst({ where: { id, ...(await orgWhere(session.user.id)) } });
    if (!existing) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    }

    await prisma.metaAdsAccount.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
