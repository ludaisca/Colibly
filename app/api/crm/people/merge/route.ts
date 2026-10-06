import { crmRoute, readJson } from "@/lib/crm/http";
import { mergePeople } from "@/lib/crm/merge";
import { rateLimit } from "@/lib/rate-limit";
import { CrmError } from "@/lib/crm/errors";

// Fusiona dos contactos: { targetId, sourceId }. Admin y user.
export const POST = crmRoute(async ({ req, actor }) => {
  const limit = await rateLimit(`crm-merge:${actor.userId}`, 30, 60);
  if (!limit.allowed) throw new CrmError(429, "rate_limited", "Demasiadas fusiones seguidas. Intenta en un momento.");
  return mergePeople(actor, await readJson(req));
});
