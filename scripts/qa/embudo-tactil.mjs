// Prueba de punta a punta del embudo en un teléfono (390x844, táctil).
// No corre en CI: Playwright no es dependencia del repo. Se corre a mano contra
// el dev (http://localhost:1100) con una cuenta de QA que tenga tratos:
//
//   QA_EMAIL=… QA_PASSWORD=… node scripts/qa/embudo-tactil.mjs
//   (PLAYWRIGHT=/ruta/a/playwright/index.mjs si no está en node_modules)
//
// Comprueba: (1) deslizar el dedo vertical sobre una tarjeta desplaza la página
// y no la mueve; (2) pulsación larga (≥ 200 ms) + arrastre a la pestaña de otra
// etapa cambia la etapa y persiste al recargar. Al final la regresa a su etapa.
const { chromium } = await import(process.env.PLAYWRIGHT ?? "playwright");
const BASE = process.env.BASE_URL ?? "http://localhost:1100";
const fail = (msg) => { console.error("FALLA:", msg); process.exitCode = 1; };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
// "load" + espera de hidratación: con el dev server, networkidle no siempre llega (HMR).
await page.goto(`${BASE}/login`, { waitUntil: "load" });
await page.waitForTimeout(2500);
await page.fill('input[type="email"]', process.env.QA_EMAIL);
await page.fill('input[type="password"]', process.env.QA_PASSWORD);
await page.press('input[type="password"]', "Enter");
await page.waitForURL(/dashboard|whatsapp|ventas/);
await page.goto(`${BASE}/ventas`, { waitUntil: "load" });
await page.waitForTimeout(2500);

const cdp = await ctx.newCDPSession(page);
const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
const patches = [];
page.on("request", (r) => { if (r.method() === "PATCH") patches.push(r.url()); });
const scrollTop = () => page.evaluate(() => document.scrollingElement.scrollTop + (document.querySelector("main")?.scrollTop ?? 0));

// La página debe poder desplazarse aunque la columna tenga pocas tarjetas.
await page.evaluate(() => document.querySelector("main")?.insertAdjacentHTML("beforeend", '<div style="height:1600px"></div>'));
const card = page.locator('[data-stage]:visible [aria-label*="Espacio"]').first();
if (!(await card.count())) { fail("la columna visible no tiene tarjetas"); await browser.close(); process.exit(); }
const label = await card.getAttribute("aria-label");
const byLabel = (scope = "") => page.locator(`${scope} [aria-label="${label}"]`.trim());

// 1. Swipe vertical.
let box = await card.boundingBox();
let x = box.x + box.width / 2, y = box.y + box.height / 2;
const before = await scrollTop();
await touch("touchStart", x, y);
for (let i = 1; i <= 10; i++) { await touch("touchMove", x, y - i * 25); await page.waitForTimeout(8); }
await touch("touchEnd");
await page.waitForTimeout(800);
if ((await scrollTop()) <= before) fail("el swipe no desplazó la página");
if (patches.length) fail("el swipe movió la tarjeta");

// 2. Pulsación larga + arrastre a la pestaña de otra etapa.
await page.evaluate(() => { window.scrollTo(0, 0); document.querySelector("main")?.scrollTo(0, 0); });
await page.waitForTimeout(300);
const from = await page.locator("[data-stage-tab][aria-pressed=true]").getAttribute("data-stage-tab");
const target = page.locator(`[data-stage-tab]:not([data-stage-tab="${from}"])`).first();
const to = await target.getAttribute("data-stage-tab");
box = await byLabel().boundingBox();
const tb = await target.boundingBox();
x = box.x + box.width / 2; y = box.y + box.height / 2;
await touch("touchStart", x, y);
await page.waitForTimeout(350);
for (let i = 1; i <= 15; i++) {
  await touch("touchMove", x + (tb.x + tb.width / 2 - x) * i / 15, y + (tb.y + tb.height / 2 - y) * i / 15);
  await page.waitForTimeout(16);
}
await page.waitForTimeout(150);
await touch("touchEnd");
await page.waitForTimeout(2500);
if (patches.length !== 1) fail(`se esperaba 1 PATCH, hubo ${patches.length}`);
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(2500);
await page.locator(`[data-stage-tab="${to}"]`).click();
if (!(await byLabel(`[data-stage="${to}"]`).count())) fail("la etapa nueva no persistió al recargar");

// Deja el tablero como estaba (menú ⋯ → Mover a etapa).
const fromName = (await page.locator(`[data-stage-tab="${from}"]`).innerText()).replace(/\s+\d[\d,]*$/, "");
await byLabel(`[data-stage="${to}"]`).locator('button[aria-label^="Opciones de"]').click();
await page.getByRole("menuitem", { name: fromName, exact: true }).click();
await page.waitForTimeout(1500);

console.log(process.exitCode ? "Con fallas" : "OK: swipe desplaza; pulsación larga mueve y persiste");
await browser.close();
