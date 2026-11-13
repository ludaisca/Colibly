import { authenticateApiKey } from "@/lib/api/auth";
import { ApiError, apiOk, methodNotAllowed, withApiErrors } from "@/lib/api/respond";
import { loadApiWhatsAppAccount, readAnalyticsRange, toWhatsAppAdminApiError } from "@/lib/api/whatsapp-admin";
import { getPricingAnalytics } from "@/lib/whatsapp/account-admin";

type Params = { params: Promise<{ id: string }> };

// GET /api/v1/accounts/{id}/analytics — mensajes cobrables y su costo según
// Meta (modelo por mensaje), por día o por mes, desglosados por país,
// categoría (MARKETING, UTILITY, AUTHENTICATION, SERVICE) y tipo de precio.
// Los costos son los de Meta, en la moneda de la WABA.
export const GET = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "whatsapp:manage");
  const { id } = await params;
  const account = await loadApiWhatsAppAccount(ctx, id);
  const url = new URL(req.url);
  const { start, end } = readAnalyticsRange(url);
  const granularity = (url.searchParams.get("granularity") ?? "DAILY").toUpperCase();
  if (granularity !== "DAILY" && granularity !== "MONTHLY") throw new ApiError(400, "invalid_request", "granularity debe ser DAILY o MONTHLY");
  try {
    const points = await getPricingAnalytics(account, { start, end, granularity });
    const totals = points.reduce((acc, p) => ({ volume: acc.volume + p.volume, cost: acc.cost + p.cost }), { volume: 0, cost: 0 });
    return apiOk({
      accountId: account.id,
      since: start.toISOString(),
      until: end.toISOString(),
      granularity,
      totals: { volume: totals.volume, cost: Math.round(totals.cost * 10_000) / 10_000 },
      data: points,
    });
  } catch (err) {
    toWhatsAppAdminApiError(err);
  }
});

export const POST = methodNotAllowed("GET");
export const PUT = POST;
export const PATCH = POST;
export const DELETE = POST;
