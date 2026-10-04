import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { getUserAccountIds } from "@/lib/shared-accounts";
import { forbidRoles } from "@/lib/roles";
import { publicErrorMessage } from "@/lib/api-errors";

async function syncTemplatesFromMeta(wabaId: string, accessToken: string) {
  type MetaTemplatesPage = {
    data?: Array<{
      id: string;
      name: string;
      language: string;
      category: string;
      status: string;
      components: unknown[];
    }>;
    paging?: { next?: string; cursors?: { after?: string } };
  };
  const templates: NonNullable<MetaTemplatesPage["data"]> = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < 100; page++) {
    const url = new URL(`https://graph.facebook.com/v21.0/${encodeURIComponent(wabaId)}/message_templates`);
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("after", cursor);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error?.message ?? "Error al sincronizar plantillas");
    }
    const data = (await res.json()) as MetaTemplatesPage;
    if (!Array.isArray(data.data)) throw new Error("Meta devolvió una lista de plantillas inválida");
    templates.push(...data.data);
    if (!data.paging?.next) return templates;
    const nextCursor = data.paging.cursors?.after;
    if (!nextCursor || seenCursors.has(nextCursor)) throw new Error("No se pudo completar la paginación de plantillas de Meta");
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }
  throw new Error("Hay demasiadas páginas de plantillas para sincronizar en una sola operación");
}

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const waAccountId = searchParams.get("waAccountId");

    if (!waAccountId) {
      return NextResponse.json(
        { error: "waAccountId es requerido" },
        { status: 400 }
      );
    }

    const accountIds = await getUserAccountIds(session.user.id);

    if (!accountIds.includes(waAccountId)) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    }

    const templates = await prisma.wATemplate.findMany({
      where: { waAccountId },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(templates);
  } catch (error) {
    const message =
      publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const denied = forbidRoles(session, ["ejecutivo"]);
    if (denied) return denied;

    const { waAccountId } = (await req.json()) as { waAccountId: string };

    const accountIds = await getUserAccountIds(session.user.id);

    if (!accountIds.includes(waAccountId)) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    }

    const account = await prisma.wAAccount.findFirst({
      where: { id: waAccountId },
    });

    if (!account) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    }

    if (account.channel !== "META_CLOUD" || !account.wabaId || !account.accessToken) {
      return NextResponse.json(
        { error: "Sincronizar plantillas solo aplica a cuentas de Meta Cloud API con WABA ID configurado" },
        { status: 400 }
      );
    }

    const accessToken = decrypt(account.accessToken);
    const metaTemplates = await syncTemplatesFromMeta(
      account.wabaId,
      accessToken
    );

    for (const t of metaTemplates) {
      await prisma.wATemplate.upsert({
        where: {
          waAccountId_templateId: {
            waAccountId: account.id,
            templateId: t.id,
          },
        },
        create: {
          waAccountId: account.id,
          templateId: t.id,
          name: t.name,
          language: t.language,
          category: t.category,
          status: t.status,
          components: t.components as object,
          syncedAt: new Date(),
        },
        update: {
          name: t.name,
          language: t.language,
          category: t.category,
          status: t.status,
          components: t.components as object,
          syncedAt: new Date(),
        },
      });
    }

    const syncedIds = metaTemplates.map((t) => t.id);
    const missing = await prisma.wATemplate.findMany({
      where: { waAccountId: account.id, templateId: { notIn: syncedIds }, status: { not: "DELETED" } },
      select: { id: true },
    });
    // No borrar: WATemplate es padre de campañas y fuentes de Google Sheets.
    // Un deleteMany en una sincronización parcial destruiría esos registros.
    if (missing.length > 0) {
      const missingIds = missing.map((t) => t.id);
      await prisma.$transaction([
        prisma.wATemplate.updateMany({ where: { id: { in: missingIds } }, data: { status: "DELETED" } }),
        prisma.leadSheetSource.updateMany({
          where: { waTemplateId: { in: missingIds }, enabled: true },
          data: { enabled: false, lastError: "La plantilla ya no aparece en Meta. Sincroniza o elige otra plantilla antes de reactivar." },
        }),
      ]);
    }

    const templates = await prisma.wATemplate.findMany({
      where: { waAccountId: account.id },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(templates);
  } catch (error) {
    const message =
      publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
