import { crmRoute, readJson } from "@/lib/crm/http";
import { applyPeopleImport } from "@/lib/crm/import";
import { rateLimit } from "@/lib/rate-limit";
import { CrmError } from "@/lib/crm/errors";

// Aplica la importación: { csv, mapping, fingerprint } (la huella de la previsualización).
export const POST = crmRoute(async ({ req, actor }) => {
  const limit = await rateLimit(`crm-import:${actor.userId}`, 10, 3600);
  if (!limit.allowed) throw new CrmError(429, "rate_limited", "Límite de importaciones alcanzado. Intenta más tarde.");
  return applyPeopleImport(actor, await readJson(req));
});
