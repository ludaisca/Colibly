const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");
const prisma = new PrismaClient();
const KEY = Buffer.from(process.env.ENCRYPTION_KEY, "hex");
const enc = (t) => { const iv = crypto.randomBytes(12); const c = crypto.createCipheriv("aes-256-gcm", KEY, iv, { authTagLength: 16 }); const e = Buffer.concat([c.update(t, "utf8"), c.final()]); return iv.toString("hex") + ":" + c.getAuthTag().toString("hex") + ":" + e.toString("hex"); };
const BASE = "http://localhost:5000", SECRET = "e2e-platform-secret";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = "") => { (ok ? pass++ : fail++); console.log((ok ? "  OK   " : "  FALLA") + " " + n + (ok ? "" : "  -> " + x)); };
async function waitFor(fn, ms = 60000) { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await sleep(700); } return null; }
async function session(email, password) {
  const c = await fetch(BASE + "/api/auth/csrf"); const csrf = (await c.json()).csrfToken;
  const jar = (c.headers.getSetCookie() || []).map((x) => x.split(";")[0]).join("; ");
  const l = await fetch(BASE + "/api/auth/callback/credentials", { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", cookie: jar }, body: new URLSearchParams({ csrfToken: csrf, email, password, json: "true" }) });
  return [jar, ...(l.headers.getSetCookie() || []).map((x) => x.split(";")[0])].join("; ");
}
(async () => {
  const stamp = Date.now(), pw = "Prueba-Segura-12345";
  const mk = async (tag) => { const email = `e2e${tag}${stamp}@example.test`; const r = await fetch(BASE + "/api/auth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Usuario " + tag, email, password: pw, businessName: "Negocio " + tag + " " + stamp }) }); if (r.status !== 201) throw new Error("registro " + r.status); const u = await prisma.user.update({ where: { email }, data: { emailVerifiedAt: new Date() }, select: { id: true, organizationId: true } }); return { email, ...u }; };
  const X = await mk("x"), Y = await mk("y");
  await prisma.platformSettings.upsert({ where: { id: "platform" }, create: { id: "platform", metaAppId: "3423949611118312", metaAppSecret: enc(SECRET), metaEmbeddedSignupConfigId: "1676025620523858" }, update: { metaAppSecret: enc(SECRET) } });
  const acc = await prisma.wAAccount.create({ data: { userId: X.id, organizationId: X.organizationId, name: "Coex X " + stamp, phoneNumberId: "93" + stamp, wabaId: "WABA_X_" + stamp, phoneNumber: "15551110000", accessToken: enc("t"), status: "CONNECTED", connectionType: "EMBEDDED_SIGNUP", coexistence: true, syncStatus: "HISTORY_REQUESTED", syncProgress: 0 } });
  await sleep(32000); // caché de PlatformSettings

  console.log("== A. Historial grande: 3000 mensajes en 150 conversaciones");
  const msgs = {};
  for (let i = 0; i < 3000; i++) { const user = "5215500" + String(100000 + (i % 150)); (msgs[user] ||= []).push(i % 2 ? { from: "15551110000", to: user, id: `wamid.BIG${stamp}_${i}`, timestamp: String(1780000000 + i), type: "text", text: { body: "respuesta " + i }, history_context: { status: "DELIVERED" } } : { from: user, id: `wamid.BIG${stamp}_${i}`, timestamp: String(1780000000 + i), type: "text", text: { body: "pregunta " + i }, history_context: { status: "READ" } }); }
  const payload = { object: "whatsapp_business_account", entry: [{ id: acc.wabaId, changes: [{ field: "history", value: { messaging_product: "whatsapp", metadata: { display_phone_number: "15551110000", phone_number_id: acc.phoneNumberId }, history: [{ metadata: { phase: 1, chunk_order: 1, progress: 100 }, threads: Object.entries(msgs).map(([id, messages]) => ({ id, messages })) }] } }] }] };
  const body = JSON.stringify(payload);
  const t0 = Date.now();
  const r = await fetch(BASE + "/api/whatsapp/webhook", { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=" + crypto.createHmac("sha256", SECRET).update(body).digest("hex") }, body });
  const ms = Date.now() - t0;
  console.log(`  (payload ${(body.length / 1024).toFixed(0)} KB, respuesta en ${ms} ms)`);
  check("el webhook responde 200 rápido (< 3 s) aunque el lote sea grande", r.status === 200 && ms < 3000, `${r.status} ${ms}ms`);
  const t1 = Date.now();
  const done = await waitFor(async () => (await prisma.wAMessage.count({ where: { origin: "HISTORY", chat: { accountId: acc.id } } })) === 3000);
  console.log(`  (3000 mensajes procesados en la cola en ${((Date.now() - t1) / 1000).toFixed(1)} s)`);
  check("los 3000 mensajes se importaron por la cola", !!done, await prisma.wAMessage.count({ where: { origin: "HISTORY", chat: { accountId: acc.id } } }));
  check("150 conversaciones, sin duplicar chats", (await prisma.wAChat.count({ where: { accountId: acc.id } })) === 150);
  const fin = await waitFor(async () => { const a = await prisma.wAAccount.findUnique({ where: { id: acc.id } }); return a.syncStatus === "COMPLETED" ? a : null; });
  check("progreso 100 marcó COMPLETED solo al terminar de guardar", !!fin);
  check("ningún mensaje del historial quedó sin leer ni con notificación", (await prisma.wAChat.count({ where: { accountId: acc.id, unreadCount: { gt: 0 } } })) === 0 && (await prisma.notification.count({ where: { userId: X.id, type: "CHAT_MESSAGE" } })) === 0);

  console.log("\n== B. Aislamiento entre organizaciones");
  const cookieY = await session(Y.email, pw), cookieX = await session(X.email, pw);
  let rr = await fetch(BASE + `/api/whatsapp/accounts/${acc.id}`, { headers: { cookie: cookieY } });
  check("otra organización NO puede ver la cuenta (404/403)", [403, 404].includes(rr.status), rr.status);
  rr = await fetch(BASE + `/api/whatsapp/accounts/${acc.id}`, { headers: { cookie: cookieX } });
  const det = await rr.json();
  check("la dueña sí la ve, con el estado de coexistencia y sin secretos", rr.status === 200 && det.coexistence === true && det.usesPlatformApp === true && det.hasAppSecret === true && det.syncStatus === "COMPLETED" && !("appSecret" in det) && !("accessToken" in det), rr.status + " " + Object.keys(det).join(","));
  rr = await fetch(BASE + "/api/whatsapp/accounts", { headers: { cookie: cookieY } });
  const listY = await rr.json();
  check("la lista de la otra organización no incluye la cuenta", Array.isArray(listY) && !listY.some((a) => a.id === acc.id));
  rr = await fetch(BASE + "/api/whatsapp/embedded-signup/complete", { method: "POST", headers: { "content-type": "application/json", cookie: cookieY }, body: JSON.stringify({ code: "CODE-DE-Y-0000", wabaId: "123456789012345", phoneNumberId: acc.phoneNumberId }) });
  const jy = await rr.json();
  check("otra organización no puede reclamar un número ya conectado (409)", rr.status === 409 && jy.code === "phone_in_use", rr.status + JSON.stringify(jy));
  const chatsY = await fetch(BASE + `/api/whatsapp/chats?page=1`, { headers: { cookie: cookieY } }).then((x) => x.json()).catch(() => null);
  const items = chatsY && (chatsY.items || chatsY);
  check("el inbox de la otra organización no ve los chats importados", Array.isArray(items) && !items.some((c) => String(c.accountId) === acc.id), JSON.stringify(items).slice(0, 120));

  console.log("\n== C. Salvaguarda de borrado: mismo user_id en dos organizaciones");
  const shared = "FB_SHARED_" + stamp;
  const a1 = await prisma.wAAccount.create({ data: { userId: X.id, organizationId: X.organizationId, name: "S1 " + stamp, phoneNumberId: "PN_S1_" + stamp, accessToken: enc("t"), connectionType: "EMBEDDED_SIGNUP", metaUserId: shared } });
  const a2 = await prisma.wAAccount.create({ data: { userId: Y.id, organizationId: Y.organizationId, name: "S2 " + stamp, phoneNumberId: "PN_S2_" + stamp, accessToken: enc("t"), connectionType: "EMBEDDED_SIGNUP", metaUserId: shared } });
  const p = Buffer.from(JSON.stringify({ algorithm: "HMAC-SHA256", user_id: shared })).toString("base64url");
  const sr = crypto.createHmac("sha256", SECRET).update(p).digest().toString("base64url") + "." + p;
  rr = await fetch(BASE + "/api/meta/data-deletion", { method: "POST", body: new URLSearchParams({ signed_request: sr }) });
  const jd = await rr.json();
  check("responde con código y URL", rr.status === 200 && !!jd.confirmation_code);
  check("NO borró ninguna de las dos cuentas", !!(await prisma.wAAccount.findUnique({ where: { id: a1.id } })) && !!(await prisma.wAAccount.findUnique({ where: { id: a2.id } })));
  const reqd = await prisma.metaDataDeletionRequest.findUnique({ where: { confirmationCode: jd.confirmation_code } });
  check("la solicitud queda en MANUAL_REVIEW", reqd && reqd.status === "MANUAL_REVIEW" && reqd.accountsDeleted === 0, reqd && reqd.status);
  const pg = await (await fetch(BASE + "/eliminacion-de-datos/" + jd.confirmation_code)).text();
  check("la página pública lo explica", pg.includes("manualmente"));

  console.log(`\nResultado: ${pass} bien, ${fail} con falla`);
  await prisma.$disconnect(); process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error("ERROR en la prueba:", e); await prisma.$disconnect(); process.exit(3); });
