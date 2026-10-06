import { crmRoute, readJson } from "@/lib/crm/http";
import { createLossReason, listLossReasons } from "@/lib/crm/pipelines";

// GET  /api/crm/loss-reasons — motivos de pérdida (`?archived=1` incluye archivados)
// POST /api/crm/loss-reasons — agrega un motivo (admin)
export const GET = crmRoute(async ({ req, actor }) => ({ items: await listLossReasons(actor, new URL(req.url).searchParams.get("archived") === "1") }));
export const POST = crmRoute(async ({ req, actor }) => Response.json(await createLossReason(actor, await readJson(req)), { status: 201 }));
