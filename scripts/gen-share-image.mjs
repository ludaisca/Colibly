// Regenera cpanel-site/assets/share.png (1200x630) y apple-touch-icon.png (180x180)
// con la paleta "Menta y grafito" a partir de plantillas HTML.
// Uso: node scripts/gen-share-image.mjs  (requiere playwright; PLAYWRIGHT_PATH
// puede apuntar a su carpeta, por defecto el node_modules de tesela).
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "/data/Proyectos/tesela/node_modules/playwright");

const C = { accent: "#0F766E", ink: "#0F1A1A", bg: "#F2F9F7", subtle: "#DDF3EE", border: "#D3E6E2", mint: "#5EEAD4" };
const MARK = `<svg viewBox="0 0 32 32" width="64" height="64"><rect width="32" height="32" rx="9" fill="${C.accent}"/><path d="M21.1 11.2 A7 7 0 1 0 21.1 20.8" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round"/></svg>`;

const share = `<!doctype html><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}body{width:1200px;height:630px;background:${C.bg} radial-gradient(${C.border} 1.5px,transparent 1.8px) 0 0/28px 28px;font-family:"Bricolage Grotesque","Hanken Grotesk",Arial,sans-serif;color:${C.ink};padding:72px 80px;display:flex;flex-direction:column;justify-content:space-between}
.brand{display:flex;align-items:center;gap:18px;font-size:40px;font-weight:700}
.pill{display:inline-flex;align-items:center;gap:12px;background:${C.subtle};border:2px solid #A9E3D6;border-radius:16px;padding:10px 20px;font-size:26px;font-weight:700;color:${C.accent};letter-spacing:.08em;text-transform:uppercase}
.dot{width:14px;height:14px;border-radius:50%;background:${C.mint}}
h1{font-size:76px;line-height:1.05;letter-spacing:-.03em;margin-top:26px;max-width:1000px}h1 em{font-style:normal;color:${C.accent}}
.row{display:flex;gap:16px;font-size:30px}.b{border-radius:16px;padding:14px 26px;font-weight:700}.b1{background:${C.accent};color:#fff}.b2{background:#fff;border:2px solid ${C.border};color:${C.ink};font-weight:500}
</style><div class="brand">${MARK}Colibly</div>
<div><span class="pill"><span class="dot"></span>Registro abierto</span><h1>Cada chat puede ser <em>una oportunidad.</em></h1></div>
<div class="row"><span class="b b1">30 días gratis</span><span class="b b2">Sin tarjeta · Cancela cuando quieras</span></div>`;

const apple = `<!doctype html><meta charset="utf-8"><body style="margin:0;width:180px;height:180px;background:${C.accent};display:flex;align-items:center;justify-content:center"><svg viewBox="0 0 32 32" width="180" height="180"><path d="M21.1 11.2 A7 7 0 1 0 21.1 20.8" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round"/></svg>`;

const browser = await chromium.launch();
for (const [html, w, h, out] of [[share, 1200, 630, "share.png"], [apple, 180, 180, "apple-touch-icon.png"]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.setContent(html);
  await page.screenshot({ path: path.join(root, "cpanel-site/assets", out) });
  await page.close();
}
await browser.close();
