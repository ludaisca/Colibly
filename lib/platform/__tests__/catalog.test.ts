import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { diffCatalog } from "../catalog-diff";

function product(id: string, name: string, plan: string): Stripe.Product {
  return { id, name, metadata: { colibly_plan: plan } } as unknown as Stripe.Product;
}

function price(input: {
  id: string;
  productId: string;
  amount: number;
  lookup?: string | null;
  plan?: string;
}): Stripe.Price {
  return {
    id: input.id,
    product: input.productId,
    unit_amount: input.amount,
    currency: "mxn",
    recurring: { interval: "month" },
    lookup_key: input.lookup ?? null,
    metadata: input.plan ? { colibly_plan: input.plan } : {},
    active: true,
  } as unknown as Stripe.Price;
}

describe("diffCatalog", () => {
  it("catálogo vacío: crea los tres productos y precios", () => {
    const diff = diffCatalog({ products: [], prices: [] });
    expect(diff.createProducts.map((p) => p.plan)).toEqual(["ESSENTIAL", "BUSINESS", "PRO"]);
    expect(diff.createPrices.map((p) => p.amount)).toEqual([5900, 8900, 14900]);
    expect(diff.transferLookup).toHaveLength(0);
    expect(diff.archivePrices).toHaveLength(0);
  });

  it("catálogo correcto: no propone nada", () => {
    const products = [
      product("prod_basic", "Colibly Básico", "ESSENTIAL"),
      product("prod_biz", "Colibly Avanzado", "BUSINESS"),
      product("prod_pro", "Colibly Pro", "PRO"),
    ];
    const prices = [
      price({ id: "price_basic", productId: "prod_basic", amount: 5900, lookup: "colibly_esencial_monthly", plan: "ESSENTIAL" }),
      price({ id: "price_biz", productId: "prod_biz", amount: 8900, lookup: "colibly_negocio_monthly", plan: "BUSINESS" }),
      price({ id: "price_pro", productId: "prod_pro", amount: 14900, lookup: "colibly_pro_monthly", plan: "PRO" }),
    ];
    const diff = diffCatalog({ products, prices });
    expect(diff.createProducts).toHaveLength(0);
    expect(diff.createPrices).toHaveLength(0);
    expect(diff.transferLookup).toHaveLength(0);
    expect(diff.renameProducts).toHaveLength(0);
    expect(diff.archivePrices).toHaveLength(0);
  });

  it("precio viejo con la lookup key: transfiere al correcto y archiva el viejo", () => {
    const products = [product("prod_basic", "Colibly Básico", "ESSENTIAL")];
    const prices = [
      price({ id: "price_old", productId: "prod_basic", amount: 9900, lookup: "colibly_esencial_monthly", plan: "ESSENTIAL" }),
      price({ id: "price_new", productId: "prod_basic", amount: 5900, plan: "ESSENTIAL" }),
    ];
    const diff = diffCatalog({ products, prices });
    expect(diff.transferLookup).toEqual([{ plan: "ESSENTIAL", priceId: "price_new", lookupKey: "colibly_esencial_monthly" }]);
    expect(diff.archivePrices.map((p) => p.priceId)).toContain("price_old");
    expect(diff.archivePrices.map((p) => p.priceId)).not.toContain("price_new");
  });

  it("producto con nombre viejo: lo renombra", () => {
    const products = [product("prod_basic", "Colibly Esencial", "ESSENTIAL")];
    const prices = [price({ id: "price_basic", productId: "prod_basic", amount: 5900, lookup: "colibly_esencial_monthly", plan: "ESSENTIAL" })];
    const diff = diffCatalog({ products, prices });
    expect(diff.renameProducts).toEqual([{ productId: "prod_basic", name: "Colibly Básico" }]);
  });

  it("no archiva el precio vigente aunque haya otros", () => {
    const products = [product("prod_biz", "Colibly Avanzado", "BUSINESS")];
    const prices = [
      price({ id: "price_ok", productId: "prod_biz", amount: 8900, lookup: "colibly_negocio_monthly", plan: "BUSINESS" }),
      price({ id: "price_old", productId: "prod_biz", amount: 19900, plan: "BUSINESS" }),
    ];
    const diff = diffCatalog({ products, prices });
    expect(diff.archivePrices.map((p) => p.priceId)).toEqual(["price_old"]);
  });

  it("respeta el price id guardado si es correcto", () => {
    const products = [product("prod_pro", "Colibly Pro", "PRO")];
    const prices = [
      price({ id: "price_a", productId: "prod_pro", amount: 14900, lookup: "colibly_pro_monthly", plan: "PRO" }),
      price({ id: "price_b", productId: "prod_pro", amount: 14900, plan: "PRO" }),
    ];
    const diff = diffCatalog({ products, prices, savedPriceIds: { PRO: "price_b" } });
    expect(diff.transferLookup).toEqual([{ plan: "PRO", priceId: "price_b", lookupKey: "colibly_pro_monthly" }]);
  });
});
