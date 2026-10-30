import type Stripe from "stripe";
import type { PlanId } from "@prisma/client";
import { PLANS } from "@/lib/billing/plans";
import { PLAN_LOOKUP_KEYS } from "@/lib/billing/stripe-rules";

// Parte pura de la reconciliación del catálogo: sin SDK ni base, testeable
// sin red. `catalog.ts` la usa y aplica el diff contra Stripe.

const PLAN_IDS: PlanId[] = ["ESSENTIAL", "BUSINESS", "PRO"];
const CURRENCY = "mxn";

export interface CatalogDiff {
  createProducts: Array<{ plan: PlanId; name: string }>;
  createPrices: Array<{ plan: PlanId; productId: string; amount: number; lookupKey: string }>;
  transferLookup: Array<{ plan: PlanId; priceId: string; lookupKey: string }>;
  renameProducts: Array<{ productId: string; name: string }>;
  archivePrices: Array<{ priceId: string; plan: PlanId; reason: string }>;
}

function productName(plan: PlanId): string {
  return `Colibly ${PLANS[plan].name}`;
}

function matchesPlan(plan: PlanId, price: Stripe.Price): boolean {
  return (
    price.unit_amount === PLANS[plan].pricePerSeatMxn * 100 &&
    price.currency.toLowerCase() === CURRENCY &&
    price.recurring?.interval === "month"
  );
}

export function diffCatalog(input: {
  products: Stripe.Product[];
  prices: Stripe.Price[];
  savedPriceIds?: Partial<Record<PlanId, string | null>>;
}): CatalogDiff {
  const diff: CatalogDiff = {
    createProducts: [],
    createPrices: [],
    transferLookup: [],
    renameProducts: [],
    archivePrices: [],
  };

  for (const plan of PLAN_IDS) {
    const key = PLAN_LOOKUP_KEYS[plan];
    const expectedName = productName(plan);
    const product =
      input.products.find((item) => item.metadata?.colibly_plan === plan) ??
      input.products.find((item) => item.name === expectedName);

    if (!product) {
      diff.createProducts.push({ plan, name: expectedName });
      diff.createPrices.push({ plan, productId: "__new__", amount: PLANS[plan].pricePerSeatMxn * 100, lookupKey: key });
      continue;
    }

    if (product.name !== expectedName) diff.renameProducts.push({ productId: product.id, name: expectedName });

    const planPrices = input.prices.filter((price) => {
      const productId = typeof price.product === "string" ? price.product : price.product?.id;
      return productId === product.id || price.metadata?.colibly_plan === plan;
    });
    const canonical = planPrices.find((price) => price.lookup_key === key) ?? null;
    const savedId = input.savedPriceIds?.[plan] ?? null;
    const saved = savedId ? planPrices.find((price) => price.id === savedId) ?? null : null;
    const correct = planPrices.find((price) => matchesPlan(plan, price)) ?? null;
    const target = (saved && matchesPlan(plan, saved) ? saved : null) ?? (canonical && matchesPlan(plan, canonical) ? canonical : null) ?? correct;

    if (!target) {
      diff.createPrices.push({ plan, productId: product.id, amount: PLANS[plan].pricePerSeatMxn * 100, lookupKey: key });
      if (canonical) diff.transferLookup.push({ plan, priceId: "__new__", lookupKey: key });
    } else if (target.lookup_key !== key) {
      diff.transferLookup.push({ plan, priceId: target.id, lookupKey: key });
    }

    for (const price of planPrices) {
      if (price.id === target?.id) continue;
      const isWrong =
        price.metadata?.colibly_plan === plan ||
        price.lookup_key === key ||
        !matchesPlan(plan, price);
      if (!isWrong) continue;
      diff.archivePrices.push({
        priceId: price.id,
        plan,
        reason:
          price.lookup_key === key
            ? "precio viejo con la lookup key canónica"
            : `precio fuera de la oferta (${price.unit_amount === null ? "sin monto" : `${price.unit_amount / 100} ${price.currency.toUpperCase()}`})`,
      });
    }
  }

  return diff;
}
