import { diffCatalog, type CatalogDiff } from "./catalog-diff";
import type { PlanId } from "@prisma/client";
import { PLANS } from "@/lib/billing/plans";
import { getStripe, invalidatePriceCache } from "@/lib/billing/stripe";
import { PLAN_LOOKUP_KEYS } from "@/lib/billing/stripe-rules";
import { getPlatformSettings, updatePlatformSettings } from "@/lib/platform-settings";

// Reconciliación del catálogo de Stripe contra lib/billing/plans.ts.
// `diffCatalog` es pura (se prueba sin red); `reconcileCatalog` aplica el diff
// con dry-run por defecto. Nunca archiva el precio vigente del plan.

const PLAN_IDS: PlanId[] = ["ESSENTIAL", "BUSINESS", "PRO"];
const CURRENCY = "mxn";


export interface ReconcileResult {
  dryRun: boolean;
  diff: CatalogDiff;
  prices: Partial<Record<PlanId, string>>;
  applied: string[];
}

function idempotency(plan: PlanId): string {
  return `colibly-catalog-${plan}-${PLANS[plan].pricePerSeatMxn}-${PLAN_LOOKUP_KEYS[plan]}`;
}

export async function reconcileCatalog(input: {
  dryRun: boolean;
  actorEmail: string;
}): Promise<ReconcileResult> {
  const stripe = await getStripe();
  const settings = await getPlatformSettings();
  const [products, prices] = await Promise.all([
    stripe.products.list({ active: true, limit: 100 }),
    stripe.prices.list({ active: true, limit: 100 }),
  ]);

  const diff = diffCatalog({
    products: products.data,
    prices: prices.data,
    savedPriceIds: {
      ESSENTIAL: settings.stripePriceEssential,
      BUSINESS: settings.stripePriceBusiness,
      PRO: settings.stripePricePro,
    },
  });

  if (input.dryRun) return { dryRun: true, diff, prices: {}, applied: [] };

  const applied: string[] = [];
  const productByPlan = new Map<PlanId, string>();
  for (const product of products.data) {
    const plan = product.metadata?.colibly_plan as PlanId | undefined;
    if (plan) productByPlan.set(plan, product.id);
  }

  for (const item of diff.createProducts) {
    const created = await stripe.products.create(
      {
        name: item.name,
        description: `Plan ${PLANS[item.plan].name} de Colibly — precio por usuario al mes (MXN).`,
        metadata: { colibly_plan: item.plan },
      },
      { idempotencyKey: `colibly-product-${item.plan}` }
    );
    productByPlan.set(item.plan, created.id);
    applied.push(`producto ${item.name}`);
  }

  const priceByPlan = new Map<PlanId, string>();
  for (const item of diff.createPrices) {
    const productId = item.productId === "__new__" ? productByPlan.get(item.plan) : item.productId;
    if (!productId) throw new Error(`No hay producto para ${item.plan}`);
    const created = await stripe.prices.create(
      {
        product: productId,
        currency: CURRENCY,
        unit_amount: item.amount,
        recurring: { interval: "month" },
        nickname: `${PLANS[item.plan].name} mensual (MXN)`,
        lookup_key: item.lookupKey,
        transfer_lookup_key: true,
        metadata: { colibly_plan: item.plan },
      },
      { idempotencyKey: idempotency(item.plan) }
    );
    priceByPlan.set(item.plan, created.id);
    applied.push(`precio ${item.amount / 100} MXN para ${item.plan}`);
  }

  // Transferencias antes de archivar: la lookup key pasa al precio vigente.
  for (const item of diff.transferLookup) {
    const priceId = item.priceId === "__new__" ? priceByPlan.get(item.plan) : item.priceId;
    if (!priceId) throw new Error(`No hay precio para transferir la lookup key de ${item.plan}`);
    const moved = await stripe.prices.update(priceId, { lookup_key: item.lookupKey, transfer_lookup_key: true });
    priceByPlan.set(item.plan, moved.id);
    applied.push(`lookup key ${item.lookupKey} → ${moved.id}`);
  }

  for (const item of diff.renameProducts) {
    await stripe.products.update(item.productId, { name: item.name });
    applied.push(`producto renombrado a ${item.name}`);
  }

  for (const item of diff.archivePrices) {
    // Nunca archivar el precio que quedó como vigente.
    if (priceByPlan.get(item.plan) === item.priceId) continue;
    await stripe.prices.update(item.priceId, { active: false });
    applied.push(`precio archivado ${item.priceId}`);
  }

  // Resolver el precio final de cada plan por su lookup key y guardarlo en
  // /plataforma. Así también queda configurado un catálogo que ya era correcto
  // pero no tenía price ids guardados.
  const finalPrices: Partial<Record<PlanId, string>> = {};
  const resolved = await stripe.prices.list({ lookup_keys: Object.values(PLAN_LOOKUP_KEYS), active: true, limit: 10 });
  const byLookup = new Map(resolved.data.map((price) => [price.lookup_key, price.id]));
  for (const plan of PLAN_IDS) {
    finalPrices[plan] = byLookup.get(PLAN_LOOKUP_KEYS[plan]) ?? priceByPlan.get(plan) ?? undefined;
  }

  await updatePlatformSettings(
    {
      stripePriceEssential: finalPrices.ESSENTIAL ?? null,
      stripePriceBusiness: finalPrices.BUSINESS ?? null,
      stripePricePro: finalPrices.PRO ?? null,
    },
    input.actorEmail
  );
  invalidatePriceCache();

  return { dryRun: false, diff, prices: finalPrices, applied };
}
