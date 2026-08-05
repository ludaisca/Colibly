import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { metaAdsAccountUpdateSchema } from "@/lib/validations";
import { encrypt, hashToken } from "@/lib/crypto";
import { validatePageToken } from "@/lib/meta/validate-page-token";
import { rateLimit } from "@/lib/rate-limit";

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
      where: { id, userId: session.user.id },
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
        createdAt: true,
        updatedAt: true,
        _count: { select: { contacts: true, conversionEvents: true } },
      },
    });

    if (!account) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    }

    return NextResponse.json(account);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno del servidor";
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
    const existing = await prisma.metaAdsAccount.findFirst({ where: { id, userId: session.user.id } });
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
        const waAccount = await prisma.wAAccount.findFirst({ where: { id: waAccountId, userId: session.user.id } });
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

    if (appSecret !== undefined) {
      data.appSecret = appSecret ? encrypt(appSecret) : null;
    }

    if (verifyToken) {
      data.verifyTokenHash = hashToken(verifyToken);
    }

    if (capiAccessToken !== undefined) {
      data.capiAccessToken = capiAccessToken ? encrypt(capiAccessToken) : null;
    }

    // mode:LIVE es una decisión de negocio explícita — nunca se activa sola.
    // Ver lib/meta/conversions.ts: rechaza mandar si no hay testEventCode NI
    // mode LIVE ya confirmado por un admin desde este mismo formulario.
    if (mode) {
      if (mode === "LIVE" && !existing.datasetId && !data.datasetId) {
        return NextResponse.json(
          { error: "Configura el Dataset ID antes de pasar a modo LIVE" },
          { status: 400 }
        );
      }
      data.mode = mode;
    }

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
    const message = error instanceof Error ? error.message : "Error interno del servidor";
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
    const existing = await prisma.metaAdsAccount.findFirst({ where: { id, userId: session.user.id } });
    if (!existing) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    }

    await prisma.metaAdsAccount.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno del servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
