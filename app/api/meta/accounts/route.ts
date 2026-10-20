import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { metaAdsAccountSchema } from "@/lib/validations";
import { encrypt, hashToken } from "@/lib/crypto";
import { validatePageToken } from "@/lib/meta/validate-page-token";
import { rateLimit } from "@/lib/rate-limit";
import { publicErrorMessage } from "@/lib/api-errors";
import { orgWhere, requireOrgId } from "@/lib/tenancy";
import { requireVerifiedEmail } from "@/lib/auth-emails";

// CRUD admin-only: MetaAdsAccount es config de negocio sensible (credenciales
// que mandan datos reales a un ad account en producción), no una cuenta
// compartible como WAAccount — sin WAAccountShare equivalente por diseño.
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (session.user.role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const unverified = await requireVerifiedEmail(session.user.id);
    if (unverified) return unverified;

    const { allowed } = await rateLimit(`meta-account-create:${session.user.id}`, 10, 60);
    if (!allowed) {
      return NextResponse.json({ error: "Demasiadas solicitudes, espera un momento" }, { status: 429 });
    }

    const body = await req.json().catch(() => null);
    const parsed = metaAdsAccountSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { name, pageId, pageAccessToken, appSecret, verifyToken, datasetId, capiAccessToken, waAccountId, testEventCode } =
      parsed.data;

    await validatePageToken(pageId, pageAccessToken);

    if (waAccountId) {
      const waAccount = await prisma.wAAccount.findFirst({ where: { id: waAccountId, ...(await orgWhere(session.user.id)) } });
      if (!waAccount) {
        return NextResponse.json({ error: "Cuenta de WhatsApp no encontrada" }, { status: 400 });
      }
    }

    const resolvedVerifyToken = verifyToken || randomBytes(24).toString("hex");
    const verifyHash = hashToken(resolvedVerifyToken);

    const account = await prisma.metaAdsAccount.create({
      data: {
        userId: session.user.id,
        organizationId: await requireOrgId(session.user.id),
        name,
        pageId,
        pageAccessToken: encrypt(pageAccessToken),
        appSecret: encrypt(appSecret),
        verifyTokenHash: verifyHash,
        datasetId: datasetId || null,
        capiAccessToken: capiAccessToken ? encrypt(capiAccessToken) : null,
        waAccountId: waAccountId || null,
        testEventCode: testEventCode || null,
        status: "CONNECTED",
      },
      select: {
        id: true,
        name: true,
        pageId: true,
        waAccountId: true,
        status: true,
        mode: true,
        createdAt: true,
      },
    });

    // El verify token solo se guarda hasheado — esta es la única respuesta
    // donde el llamador ve el valor en claro, para copiarlo al webhook de Meta.
    return NextResponse.json({ ...account, verifyToken: resolvedVerifyToken }, { status: 201 });
  } catch (error) {
    const message = publicErrorMessage(error, "Error interno del servidor");
    const status = message.includes("Token validation failed") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

// Umbral del reporte de drift (ver Contact.metaAdsAccountId en el schema): un
// lead de Instant Form nace sin `chat` porque no ha escrito por WhatsApp
// todavía — normal en las primeras horas, pero si sigue así después de una
// semana probablemente el phone_number de Meta no matchea el remoteJid real.
const DRIFT_DAYS = 7;

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (session.user.role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const accounts = await prisma.metaAdsAccount.findMany({
      where: { ...(await orgWhere(session.user.id)) },
      select: {
        id: true,
        name: true,
        pageId: true,
        status: true,
        errorMessage: true,
        mode: true,
        datasetId: true,
        waAccountId: true,
        waAccount: { select: { id: true, name: true } },
        appSecret: true,
        capiAccessToken: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { contacts: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    const driftCutoff = new Date(Date.now() - DRIFT_DAYS * 24 * 60 * 60 * 1000);
    const withDrift = await Promise.all(
      accounts.map(async ({ appSecret, capiAccessToken, ...account }) => {
        const driftCount = await prisma.contact.count({
          where: {
            metaAdsAccountId: account.id,
            leadOrigin: "INSTANT_FORM",
            chat: null,
            createdAt: { lt: driftCutoff },
          },
        });
        // Solo el booleano — el secreto nunca sale de la API.
        return { ...account, hasAppSecret: !!appSecret, hasCapiAccessToken: !!capiAccessToken, driftCount };
      })
    );

    return NextResponse.json(withDrift);
  } catch (error) {
    const message = publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
