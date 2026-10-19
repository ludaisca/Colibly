// Genera los precios del sitio estático de cPanel a partir de
// lib/billing/plans.ts + lib/billing/plan-features.ts (única fuente):
//   - cpanel-site/pricing.generated.php  (constantes PHP que usan precios.php,
//     index.php y terminos.php)
//   - el bloque marcado de cpanel-site/llms.txt
//
// Uso (dentro del contenedor app, o con Node ≥ 22.18 que quita los tipos de .ts):
//   node scripts/gen-cpanel-pricing.mjs          # escribe los archivos
//   node scripts/gen-cpanel-pricing.mjs --check  # falla si están desactualizados
// El test lib/billing/__tests__/cpanel-pricing.test.ts hace el mismo --check.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const PHP_PATH = path.join(ROOT, "cpanel-site/pricing.generated.php");
export const LLMS_PATH = path.join(ROOT, "cpanel-site/llms.txt");
export const LLMS_START = "<!-- precios: generado por scripts/gen-cpanel-pricing.mjs, no editar a mano -->";
export const LLMS_END = "<!-- /precios -->";

async function loadCatalog() {
  const plans = await import(pathToFileURL(path.join(ROOT, "lib/billing/plans.ts")).href);
  const features = await import(pathToFileURL(path.join(ROOT, "lib/billing/plan-features.ts")).href);
  return { ...plans, ...features };
}

function php(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
  if (Array.isArray(value)) return `[${value.map(php).join(", ")}]`;
  return `[${Object.entries(value).map(([k, v]) => `${php(k)} => ${php(v)}`).join(", ")}]`;
}

export async function buildOutputs() {
  const c = await loadCatalog();
  const plans = c.PLAN_LIST.map((p) => {
    const f = c.planFeatures(p);
    return {
      id: p.id,
      name: p.name,
      price: p.pricePerSeatMxn,
      price_label: c.formatMxn(p.pricePerSeatMxn),
      tagline: p.tagline,
      features: f.filter((x) => x.included).map((x) => x.text),
      missing: f.filter((x) => !x.included).map((x) => x.text),
      featured: p.id === "PRO",
    };
  });
  const pricesSentence = c.PLAN_LIST.map(c.priceSentence).join("; ");
  const constants = {
    COLIBLY_TRIAL_DAYS: c.TRIAL_DAYS,
    COLIBLY_TRIAL_MAX_SEATS: c.TRIAL_MAX_SEATS,
    COLIBLY_GRACE_DAYS: c.GRACE_DAYS,
    COLIBLY_PRICE_CURRENCY: c.PRICE_CURRENCY,
    COLIBLY_PRICE_UNIT: c.PRICE_UNIT,
    COLIBLY_PRICE_TAX_NOTE: c.PRICE_TAX_NOTE ?? "",
    COLIBLY_MIN_PRICE_LABEL: c.formatMxn(Math.min(...c.PLAN_LIST.map((p) => p.pricePerSeatMxn))),
    COLIBLY_PRICES_SENTENCE: pricesSentence,
    // Bolsa plana de la prueba (no se multiplica por ejecutivos).
    COLIBLY_TRIAL_AI_CREDITS: c.TRIAL_POOL.aiCreditsPerMonth.toLocaleString("es-MX"),
    COLIBLY_TRIAL_CONTACTS: c.TRIAL_POOL.contacts.toLocaleString("es-MX"),
    COLIBLY_TRIAL_POOL_TEXT: c.TRIAL_POOL_TEXT,
    COLIBLY_COEXISTENCE_PITCH: c.COEXISTENCE_PITCH,
    COLIBLY_META_FEES_NOTE: c.META_FEES_NOTE,
  };
  const phpOut =
    "<?php\n" +
    "// GENERADO por scripts/gen-cpanel-pricing.mjs desde lib/billing/plans.ts y\n" +
    "// lib/billing/plan-features.ts. NO editar a mano: cambia plans.ts y vuelve a\n" +
    "// correr `node scripts/gen-cpanel-pricing.mjs` (un test falla si divergen).\n" +
    Object.entries(constants).map(([k, v]) => `const ${k} = ${php(v)};\n`).join("") +
    `const COLIBLY_PLANS = [\n${plans.map((p) => `  ${php(p)},\n`).join("")}];\n`;

  const pro = c.PLANS.PRO;
  const llmsBlock = [
    LLMS_START,
    "## Planes y precios",
    `- Se cobra por ejecutivo (cada usuario que atiende conversaciones, incluido el dueño), cada mes, en pesos mexicanos: ${pricesSentence}${c.PRICE_TAX_NOTE ? ` (${c.PRICE_TAX_NOTE})` : ""}. Sin plan anual.`,
    `- ${c.COEXISTENCE_PITCH} Telegram, Messenger e Instagram (por habilitación): 1 cuenta de cada uno por ejecutivo.`,
    ...plans.map((p) => `- ${p.name}: ${p.features.join("; ")}${p.missing.length ? `. No incluye: ${p.missing.join(", ")}` : ""}.`),
    `- Prueba: ${c.TRIAL_DAYS} días gratis, sin tarjeta, con el plan ${pro.name} para hasta ${c.TRIAL_MAX_SEATS} ejecutivos y ${c.TRIAL_POOL_TEXT}.`,
    `- ${c.META_FEES_NOTE}`,
    LLMS_END,
  ].join("\n");
  return { php: phpOut, llmsBlock };
}

export function replaceLlmsBlock(llms, block) {
  const a = llms.indexOf(LLMS_START);
  const b = llms.indexOf(LLMS_END);
  if (a === -1 || b === -1) throw new Error(`cpanel-site/llms.txt no tiene los marcadores ${LLMS_START} … ${LLMS_END}`);
  return llms.slice(0, a) + block + llms.slice(b + LLMS_END.length);
}

async function main() {
  const check = process.argv.includes("--check");
  const { php: phpOut, llmsBlock } = await buildOutputs();
  const llms = await readFile(LLMS_PATH, "utf8");
  const nextLlms = replaceLlmsBlock(llms, llmsBlock);
  const currentPhp = await readFile(PHP_PATH, "utf8").catch(() => "");
  if (check) {
    const stale = [currentPhp !== phpOut && PHP_PATH, llms !== nextLlms && LLMS_PATH].filter(Boolean);
    if (stale.length) {
      console.error(`Desactualizado respecto a lib/billing/plans.ts: ${stale.join(", ")}. Corre node scripts/gen-cpanel-pricing.mjs`);
      process.exit(1);
    }
    console.log("cPanel al día con lib/billing/plans.ts");
    return;
  }
  await writeFile(PHP_PATH, phpOut);
  await writeFile(LLMS_PATH, nextLlms);
  console.log(`Escrito ${path.relative(ROOT, PHP_PATH)} y el bloque de precios de ${path.relative(ROOT, LLMS_PATH)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
