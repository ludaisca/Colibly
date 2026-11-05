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
  "lib/email/templates.ts",
  "app/(dashboard)/configuracion/plan/_view.tsx",
  "lib/billing/plan-features.ts",
];

describe("oferta de la landing", () => {
  it("muestra los cuatro precios públicos en MXN, al mes", async () => {
    const text = await readFile(path.join(ROOT, "app/(marketing)/_landing-offer-data.ts"), "utf8");
    // Los precios salen de plans.ts (PLANS[id].pricePerSeatMxn), no de literales.
    expect(text).toMatch(/pricePerSeatMxn/);
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

describe("la oferta sale del catálogo de licencias", () => {
  it("cupos, créditos y recomendado coinciden con licenses.ts", async () => {
    const { LICENSES } = await import("@/lib/billing/licenses");
    const [base, advanced, pro] = LANDING_PLANS;
    expect(base.credits).toBe("Sin créditos de IA");
    expect(advanced.credits).toContain(LICENSES.BUSINESS.aiCreditsPerMonth.toLocaleString("es-MX"));
    expect(pro.leads).toContain(LICENSES.PRO.activeLeads.toLocaleString("es-MX"));
    expect(LANDING_PLANS.filter((p) => p.featured).map((p) => p.id)).toEqual(["advanced"]);
    expect(PLANS.BUSINESS.badge).toBe("Recomendado");
    expect(Object.values(PLANS).some((p) => p.badge === "Más popular")).toBe(false);
  });

  it("la API y los webhooks se anuncian solo en Pro", async () => {
    const { OFFER_GROUPS } = await import("@/app/(marketing)/_landing-offer-data");
    const rows = OFFER_GROUPS.flatMap((g) => g.items).filter((i): i is Extract<typeof i, { kind: "row" }> => i.kind === "row");
    for (const label of ["API", "Webhooks"]) expect(rows.find((r) => r.label === label)?.cells.slice(0, 3)).toEqual([false, false, true]);
  });
});
