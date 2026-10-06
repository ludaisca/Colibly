import { crmRoute } from "@/lib/crm/http";
import { exportPeopleCsv } from "@/lib/crm/export";
import { filtersFromParams } from "@/lib/crm/schemas";
import { rateLimit } from "@/lib/rate-limit";
import { CrmError } from "@/lib/crm/errors";

// CSV de los contactos que cumplen los filtros del listado (admin y user).
export const GET = crmRoute(async ({ req, actor }) => {
  const limit = await rateLimit(`crm-export:${actor.userId}`, 10, 3600);
  if (!limit.allowed) throw new CrmError(429, "rate_limited", "Límite de exportaciones alcanzado. Intenta más tarde.");
  const { csv, truncated } = await exportPeopleCsv(actor, filtersFromParams(new URL(req.url).searchParams));
  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="contactos.csv"',
      ...(truncated ? { "X-Export-Truncated": "true" } : {}),
    },
  });
});
