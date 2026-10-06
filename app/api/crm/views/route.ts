import { crmRoute, readJson } from "@/lib/crm/http";
import { createView, listViews } from "@/lib/crm/views";

export const GET = crmRoute(async ({ req, actor }) => {
  const entity = new URL(req.url).searchParams.get("entity");
  return { items: await listViews(actor, entity === "PEOPLE" || entity === "COMPANIES" ? entity : null) };
});
export const POST = crmRoute(async ({ req, actor }) => Response.json(await createView(actor, await readJson(req)), { status: 201 }));
