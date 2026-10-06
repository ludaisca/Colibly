import { crmRoute, readJson } from "@/lib/crm/http";
import { updateCurrency } from "@/lib/crm/pipelines";
import { prisma } from "@/lib/prisma";
import { CURRENCIES } from "@/lib/crm/deal-rules";

// GET   /api/crm/settings — moneda de la organización y las admitidas
// PATCH /api/crm/settings — { currency } (admin)
export const GET = crmRoute(async ({ actor }) => {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { currency: true } });
  return { currency: org.currency, currencies: CURRENCIES };
});
export const PATCH = crmRoute(async ({ req, actor }) => updateCurrency(actor, await readJson(req)));
