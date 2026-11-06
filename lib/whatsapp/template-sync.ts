import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { GRAPH_API_BASE } from "@/lib/meta/graph";
import { rateLimit } from "@/lib/rate-limit";
import type { WAAccount, WATemplate } from "@prisma/client";

// Sincronización de plantillas con Meta, compartida por el botón "Sincronizar"
// (POST /api/whatsapp/templates), la API pública (POST /api/v1/templates/sync),
// el webhook (una plantilla que aún no conocemos) y el refresco automático de
// las pendientes.

interface MetaTemplate {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  components: unknown[];
  rejected_reason?: string;
}

interface MetaTemplatesPage {
  data?: MetaTemplate[];
  paging?: { next?: string; cursors?: { after?: string } };
}

const FIELDS = "id,name,language,category,status,components,rejected_reason";

export async function fetchMetaTemplates(wabaId: string, accessToken: string): Promise<MetaTemplate[]> {
  const templates: MetaTemplate[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < 100; page++) {
    const url = new URL(`${GRAPH_API_BASE}/${encodeURIComponent(wabaId)}/message_templates`);
    url.searchParams.set("limit", "100");
    url.searchParams.set("fields", FIELDS);
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

export class TemplateSyncError extends Error {
  constructor(message: string, readonly code: "not_configured" | "upstream") {
    super(message);
  }
}

/**
 * Trae las plantillas de la WABA de la cuenta, las guarda y marca como DELETED
 * las que Meta ya no devuelve. Nunca borra filas: WATemplate es padre de campañas
 * y fuentes de Google Sheets, y una lista parcial destruiría esos registros.
 */
export async function syncAccountTemplates(account: WAAccount): Promise<WATemplate[]> {
  if (account.channel !== "META_CLOUD" || !account.wabaId || !account.accessToken) {
    throw new TemplateSyncError("Esta cuenta no tiene WABA ID y token configurados", "not_configured");
  }
  let metaTemplates: MetaTemplate[];
  try {
    metaTemplates = await fetchMetaTemplates(account.wabaId, decrypt(account.accessToken));
  } catch (err) {
    throw new TemplateSyncError(err instanceof Error ? err.message : "Error al sincronizar plantillas", "upstream");
  }

  const now = new Date();
  for (const t of metaTemplates) {
    const data = {
      name: t.name,
      language: t.language,
      category: t.category,
      status: t.status,
      components: t.components as object,
      statusReason: t.rejected_reason && t.rejected_reason !== "NONE" ? t.rejected_reason : null,
      syncedAt: now,
    };
    await prisma.wATemplate.upsert({
      where: { waAccountId_templateId: { waAccountId: account.id, templateId: t.id } },
      create: { waAccountId: account.id, templateId: t.id, ...data },
      update: data,
    });
  }

  const missing = await prisma.wATemplate.findMany({
    where: { waAccountId: account.id, templateId: { notIn: metaTemplates.map((t) => t.id) }, status: { not: "DELETED" } },
    select: { id: true },
  });
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

  return prisma.wATemplate.findMany({ where: { waAccountId: account.id }, orderBy: [{ name: "asc" }, { language: "asc" }] });
}

/** Estados en los que Meta todavía tiene que decidir algo. */
export const PENDING_TEMPLATE_STATUSES = ["PENDING", "IN_APPEAL"] as const;
/** Mínimo entre refrescos automáticos de una misma cuenta. */
const AUTO_REFRESH_SECONDS = 60;

/**
 * Red de seguridad para cuando el webhook de estado no llega (campo sin
 * suscribir en la app de Meta, caída…): si la cuenta tiene plantillas
 * pendientes, sincroniza en segundo plano, como mucho una vez por minuto.
 * Llamar desde `after()`; nunca lanza.
 */
export async function refreshPendingTemplates(accountIds: string[]): Promise<void> {
  try {
    const pending = await prisma.wATemplate.findMany({
      where: { waAccountId: { in: accountIds }, status: { in: [...PENDING_TEMPLATE_STATUSES] } },
      select: { waAccountId: true },
      distinct: ["waAccountId"],
    });
    for (const { waAccountId } of pending) {
      const { allowed } = await rateLimit(`tpl-auto-sync:${waAccountId}`, 1, AUTO_REFRESH_SECONDS);
      if (!allowed) continue;
      const account = await prisma.wAAccount.findUnique({ where: { id: waAccountId } });
      if (!account) continue;
      await syncAccountTemplates(account).catch((err) =>
        console.warn("[templates] refresco automático falló", { accountId: waAccountId, error: err instanceof Error ? err.message : String(err) })
      );
    }
  } catch (err) {
    console.warn("[templates] refresco automático falló", err);
  }
}
