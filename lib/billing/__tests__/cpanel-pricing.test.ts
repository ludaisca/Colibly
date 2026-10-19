import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildOutputs, LLMS_END, LLMS_PATH, LLMS_START, PHP_PATH, replaceLlmsBlock } from "../../../scripts/gen-cpanel-pricing.mjs";

// El sitio de cPanel no puede leer plans.ts: sus precios salen de
// scripts/gen-cpanel-pricing.mjs. Si alguien cambia plans.ts y no regenera
// (o edita los precios a mano en cPanel), esto falla.
describe("precios de cPanel = lib/billing/plans.ts", () => {
  it("pricing.generated.php está al día (node scripts/gen-cpanel-pricing.mjs)", async () => {
    const { php } = await buildOutputs();
    expect(await readFile(PHP_PATH, "utf8")).toBe(php);
  });

  it("el bloque de precios de llms.txt está al día", async () => {
    const { llmsBlock } = await buildOutputs();
    const llms = await readFile(LLMS_PATH, "utf8");
    expect(llms).toContain(LLMS_START);
    expect(llms).toContain(LLMS_END);
    expect(replaceLlmsBlock(llms, llmsBlock)).toBe(llms);
  });

  it("ninguna página de cPanel repite precios a mano ni habla de USD o impuestos", async () => {
    const dir = path.dirname(PHP_PATH);
    const files = (await readdir(dir)).filter((f) => /\.(php|txt)$/.test(f) && f !== "pricing.generated.php");
    for (const f of files) {
      const raw = await readFile(path.join(dir, f), "utf8");
      // El bloque generado de llms.txt sí lleva los precios (lo valida el test de arriba).
      const a = raw.indexOf(LLMS_START);
      const b = raw.indexOf(LLMS_END);
      const text = a !== -1 && b !== -1 ? raw.slice(0, a) + raw.slice(b) : raw;
      expect(text, f).not.toMatch(/\bUSD\b|d[óo]lares/);
      expect(text, f).not.toMatch(/\bIVA\b|impuestos|precio final/i);
      // Precios en pesos solo vía las constantes generadas.
      expect(text, f).not.toMatch(/\$\s?(149|299)\b/);
    }
  });

  it("precios.php, index.php y terminos.php usan el include generado", async () => {
    const dir = path.dirname(PHP_PATH);
    for (const f of ["precios.php", "index.php", "terminos.php"]) {
      expect(await readFile(path.join(dir, f), "utf8"), f).toContain("pricing.generated.php");
    }
  });
});
