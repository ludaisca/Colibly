import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Decisión 2026-10-19: precios en MXN por ejecutivo, sin afirmaciones de
// impuestos (no se factura). La leyenda, si algún día hace falta, va en
// PRICE_TAX_NOTE de plans.ts — nunca escrita a mano en las páginas.
const ROOT = path.resolve(__dirname, "../../..");
const PAGES = [
  "app/(marketing)/page.tsx",
  "app/(marketing)/precios/page.tsx",
  "app/(marketing)/terminos/page.tsx",
  "app/(marketing)/_share-image.tsx",
  "app/(dashboard)/configuracion/plan/_view.tsx",
  "lib/billing/plan-features.ts",
];

describe("copia pública de precios", () => {
  it.each(PAGES)("%s no habla de USD ni de impuestos", async (rel) => {
    const text = await readFile(path.join(ROOT, rel), "utf8");
    expect(text).not.toMatch(/\bUSD\b|en dólares/);
    expect(text).not.toMatch(/incluye IVA|precio final|si incluye impuestos/i);
  });
});
