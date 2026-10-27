import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LANDING_PLANS } from "@/app/(marketing)/_landing-offer-data";
import { PLANS } from "@/lib/billing/plans";

// La oferta pública y el catálogo que cobra la app son el mismo: MXN por
// usuario al mes, sin afirmaciones de impuestos.
const ROOT = path.resolve(__dirname, "../../..");
const PAGES = [
  "app/(marketing)/page.tsx",
  "app/(marketing)/_landing-offer.tsx",
  "app/(marketing)/_landing-offer-data.ts",
  "app/(marketing)/precios/page.tsx",
  "app/(marketing)/terminos/page.tsx",
  "app/(marketing)/_share-image.tsx",
  "app/(dashboard)/configuracion/plan/_view.tsx",
  "lib/billing/plan-features.ts",
];

describe("oferta de la landing", () => {
  it("muestra los cuatro precios públicos en MXN, al mes", async () => {
    const text = await readFile(path.join(ROOT, "app/(marketing)/_landing-offer-data.ts"), "utf8");
    expect(text).toMatch(/priceMxn: 59/);
    expect(text).toMatch(/priceMxn: 89/);
    expect(text).toMatch(/priceMxn: 149/);
    expect(text).toMatch(/priceMxn: null/);
    expect(text).not.toMatch(/\bUSD\b|6 meses/);
    expect(LANDING_PLANS.map((p) => p.priceMxn)).toEqual([
      PLANS.ESSENTIAL.pricePerSeatMxn,
      PLANS.BUSINESS.pricePerSeatMxn,
      PLANS.PRO.pricePerSeatMxn,
      null,
    ]);
  });
});

describe("copia pública de precios", () => {
  it.each(PAGES)("%s no habla de USD ni de impuestos", async (rel) => {
    const text = await readFile(path.join(ROOT, rel), "utf8");
    expect(text).not.toMatch(/\bUSD\b|en dólares/);
    expect(text).not.toMatch(/incluye IVA|precio final|si incluye impuestos/i);
  });
});
