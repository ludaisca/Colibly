import { crmRoute } from "@/lib/crm/http";
import { listTimeline } from "@/lib/crm/people";

export const GET = crmRoute<{ id: string }>(async ({ req, actor, params }) => {
  const sp = new URL(req.url).searchParams;
  return listTimeline(actor, params.id, sp.get("cursor"), Number(sp.get("limit")) || 30);
});
