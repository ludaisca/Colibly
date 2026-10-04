// Alta con Embedded Signup + sincronización + vigilancia, contra un Meta simulado.
const { PrismaClient } = require("@prisma/client");
const { Queue } = require("bullmq");
const crypto = require("crypto");
const http = require("http");
const prisma = new PrismaClient();
const KEY = Buffer.from(process.env.ENCRYPTION_KEY, "hex");
const enc = (t) => { const iv = crypto.randomBytes(12); const c = crypto.createCipheriv("aes-256-gcm", KEY, iv, { authTagLength: 16 }); const e = Buffer.concat([c.update(t, "utf8"), c.final()]); return iv.toString("hex") + ":" + c.getAuthTag().toString("hex") + ":" + e.toString("hex"); };
const dec = (v) => { const [i, t, c] = v.split(":"); const d = crypto.createDecipheriv("aes-256-gcm", KEY, Buffer.from(i, "hex"), { authTagLength: 16 }); d.setAuthTag(Buffer.from(t, "hex")); return Buffer.concat([d.update(Buffer.from(c, "hex")), d.final()]).toString("utf8"); };
const BASE = "http://localhost:5000";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = "") => { (ok ? pass++ : fail++); console.log((ok ? "  OK   " : "  FALLA") + " " + n + (ok ? "" : "  -> " + x)); };
async function waitFor(fn, ms = 20000) { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await sleep(500); } return null; }

// ---- Meta simulado --------------------------------------------------------
const calls = [];
const STAMP = Date.now();
const WABA_COEX = "11" + STAMP, WABA_NEW = "22" + STAMP, WABA_BAD = "33" + STAMP;
const PN_COEX = "91" + STAMP, PN_NEW = "92" + STAMP;
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  let body = ""; req.on("data", (c) => (body += c));
  req.on("end", () => {
    const path = url.pathname.replace(/^\/v\d+\.\d+/, "");
    calls.push({ method: req.method, path, auth: req.headers.authorization || null, body: body ? JSON.parse(body) : null, q: Object.fromEntries(url.searchParams) });
    const send = (code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
    if (path === "/oauth/access_token") return url.searchParams.get("code").startsWith("BADCODE") ? send(400, { error: { message: "code expired", code: 100 } }) : send(200, { access_token: "MOCKTOKEN-" + url.searchParams.get("code"), token_type: "bearer", expires_in: 5184000 });
    if (path === "/debug_token") return send(200, { data: { user_id: "MOCK_FB_USER" } });
    let m;
    if ((m = path.match(/^\/(\d+)\/phone_numbers$/))) {
      if (m[1] === WABA_COEX) return send(200, { data: [{ id: PN_COEX, display_phone_number: "+52 55 1111 2222", verified_name: "Negocio Coex", is_on_biz_app: true }] });
      if (m[1] === WABA_NEW) return send(200, { data: [{ id: PN_NEW, display_phone_number: "+52 55 3333 4444", verified_name: "Negocio Nuevo", is_on_biz_app: false }] });
      return send(200, { data: [] });
    }
    if ((m = path.match(/^\/(\d+)\/subscribed_apps$/))) return send(200, { success: true });
    if ((m = path.match(/^\/(\d+)\/register$/))) return send(200, { success: true });
    if ((m = path.match(/^\/(\d+)\/smb_app_data$/))) return send(200, { messaging_product: "whatsapp", request_id: "REQ-" + JSON.parse(body).sync_type });
    send(404, { error: { message: "no simulado: " + path } });
  });
});

(async () => {
  await new Promise((r) => server.listen(9999, "127.0.0.1", r));
  const stamp = STAMP;
  const email = `e2eb${stamp}@example.test`, password = "Prueba-Segura-12345";
  const reg = await fetch(BASE + "/api/auth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "E2E B", email, password, businessName: "E2E-B " + stamp }) });
  if (reg.status !== 201) { console.log("registro falló", reg.status, await reg.text()); process.exit(2); }
  const user = await prisma.user.update({ where: { email }, data: { emailVerifiedAt: new Date() }, select: { id: true, organizationId: true } });
  await prisma.platformSettings.upsert({ where: { id: "platform" }, create: { id: "platform", metaAppId: "3423949611118312", metaAppSecret: enc("e2e-platform-secret"), metaEmbeddedSignupConfigId: "1676025620523858", metaWebhookVerifyToken: enc("verifytoken123") }, update: { metaAppId: "3423949611118312", metaAppSecret: enc("e2e-platform-secret"), metaEmbeddedSignupConfigId: "1676025620523858" } });

  // sesión
  const csrfRes = await fetch(BASE + "/api/auth/csrf");
  const csrf = (await csrfRes.json()).csrfToken;
  const jar = (csrfRes.headers.getSetCookie() || []).map((c) => c.split(";")[0]).join("; ");
  const login = await fetch(BASE + "/api/auth/callback/credentials", { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", cookie: jar }, body: new URLSearchParams({ csrfToken: csrf, email, password, json: "true" }) });
  const cookie = [jar, ...(login.headers.getSetCookie() || []).map((c) => c.split(";")[0])].join("; ");
  const api = (path, opts = {}) => fetch(BASE + path, { ...opts, headers: { "content-type": "application/json", cookie, ...(opts.headers || {}) } });
  console.log("(esperando 32 s a que expire el caché de PlatformSettings…)");
  await sleep(32000);

  console.log("\n== 1. Configuración pública para el navegador");
  let r = await api("/api/whatsapp/embedded-signup/config");
  const cfg = await r.json();
  check("config disponible con App ID y configuración", r.status === 200 && cfg.available === true && cfg.appId === "3423949611118312" && cfg.configId === "1676025620523858", JSON.stringify(cfg));
  check("coexistencia NO permitida por defecto (bandera apagada)", cfg.coexistenceAllowed === false);
  check("la respuesta no trae secretos", !JSON.stringify(cfg).includes("e2e-platform-secret") && !JSON.stringify(cfg).includes("verifytoken"));
  r = await fetch(BASE + "/api/whatsapp/embedded-signup/config");
  check("sin sesión → 401", r.status === 401, r.status);

  console.log("\n== 2. Coexistencia con la bandera apagada");
  const coex = { code: "CODE-COEX-0000", wabaId: WABA_COEX, phoneNumberId: null, coexistence: true };
  r = await api("/api/whatsapp/embedded-signup/complete", { method: "POST", body: JSON.stringify(coex) });
  let j = await r.json();
  check("→ 403 coexistence_disabled", r.status === 403 && j.code === "coexistence_disabled", r.status + " " + JSON.stringify(j));
  check("no se creó ninguna cuenta", (await prisma.wAAccount.count({ where: { organizationId: user.organizationId } })) === 0);
  check("no se suscribió la WABA", !calls.some((c) => c.path.endsWith("/subscribed_apps")));

  console.log("\n== 3. Coexistencia con la bandera encendida (alta completa)");
  await prisma.organization.update({ where: { id: user.organizationId }, data: { whatsappCoexistenceEnabled: true } });
  calls.length = 0;
  r = await api("/api/whatsapp/embedded-signup/complete", { method: "POST", body: JSON.stringify(coex) });
  j = await r.json();
  check("→ 201 con coexistence=true", r.status === 201 && j.coexistence === true && !!j.id, r.status + " " + JSON.stringify(j));
  const acc = await prisma.wAAccount.findUnique({ where: { id: j.id } });
  check("cuenta EMBEDDED_SIGNUP/CONNECTED en la organización correcta", acc && acc.connectionType === "EMBEDDED_SIGNUP" && acc.status === "CONNECTED" && acc.organizationId === user.organizationId && acc.userId === user.id);
  check("número resuelto desde la WABA (el navegador no lo mandó)", acc && acc.phoneNumberId === PN_COEX && acc.phoneNumber === "+52 55 1111 2222" && acc.wabaId === WABA_COEX);
  check("token cifrado en base de datos y descifrable", acc && !acc.accessToken.includes("MOCKTOKEN") && dec(acc.accessToken) === "MOCKTOKEN-CODE-COEX-0000");
  check("vencimiento del token ≈ 60 días", acc && Math.abs(acc.tokenExpiresAt.getTime() - (Date.now() + 5184000 * 1000)) < 120000);
  check("límite de sincronización ≈ 24 h", acc && Math.abs(acc.syncDeadlineAt.getTime() - (Date.now() + 24 * 3600 * 1000)) < 120000);
  check("metaUserId guardado desde debug_token", acc && acc.metaUserId === "MOCK_FB_USER");
  check("sin appSecret propio ni PIN (coexistencia no registra)", acc && acc.appSecret === null && acc.twoStepPin === null);
  check("se suscribió la WABA con el token del cliente", calls.some((c) => c.method === "POST" && c.path === `/${WABA_COEX}/subscribed_apps` && c.auth === "Bearer MOCKTOKEN-CODE-COEX-0000"));
  check("NO se llamó a /register", !calls.some((c) => c.path.endsWith("/register")));
  check("el App Secret viaja solo al intercambiar el código", calls.filter((c) => c.q.client_secret).length === 1 && calls.find((c) => c.q.client_secret).path === "/oauth/access_token");

  console.log("\n== 4. Job de sincronización pide contactos e historial a Meta");
  const synced = await waitFor(async () => { const a = await prisma.wAAccount.findUnique({ where: { id: acc.id } }); return a.syncStatus === "HISTORY_REQUESTED" ? a : null; });
  check("estado final HISTORY_REQUESTED", !!synced);
  const smb = calls.filter((c) => c.path.endsWith("/smb_app_data"));
  check("se pidió smb_app_state_sync primero y history después, una vez cada uno", smb.length === 2 && smb[0].body.sync_type === "smb_app_state_sync" && smb[1].body.sync_type === "history", JSON.stringify(smb.map((c) => c.body)));
  check("request_ids guardados", synced && synced.syncRequestIds && synced.syncRequestIds.contacts === "REQ-smb_app_state_sync" && synced.syncRequestIds.history === "REQ-history", JSON.stringify(synced && synced.syncRequestIds));
  const q = new Queue("coexistence-sync", { connection: { url: process.env.REDIS_URL } });
  await q.add("sync", { accountId: acc.id });
  await sleep(2500);
  check("un job repetido NO vuelve a pedir lo que ya se pidió", calls.filter((c) => c.path.endsWith("/smb_app_data")).length === 2);

  console.log("\n== 5. Duplicados y errores de Meta");
  r = await api("/api/whatsapp/embedded-signup/complete", { method: "POST", body: JSON.stringify({ ...coex, code: "CODE-OTRA-0001" }) });
  j = await r.json();
  check("mismo número otra vez → 409 phone_in_use", r.status === 409 && j.code === "phone_in_use", r.status + " " + JSON.stringify(j));
  r = await api("/api/whatsapp/embedded-signup/complete", { method: "POST", body: JSON.stringify({ code: "BADCODE-0000", wabaId: WABA_NEW, coexistence: false }) });
  j = await r.json();
  check("código vencido → 502 token_exchange_failed con el mensaje de Meta", r.status === 502 && j.code === "token_exchange_failed" && j.error.includes("code expired"), r.status + " " + JSON.stringify(j));
  r = await api("/api/whatsapp/embedded-signup/complete", { method: "POST", body: JSON.stringify({ code: "CODE-VALIDO-123", wabaId: WABA_BAD, coexistence: false }) });
  j = await r.json();
  check("WABA sin números → 400 no_phone", r.status === 400 && j.code === "no_phone", r.status + " " + JSON.stringify(j));
  r = await api("/api/whatsapp/embedded-signup/complete", { method: "POST", body: JSON.stringify({ code: "x", wabaId: "abc" }) });
  check("cuerpo inválido → 400", r.status === 400, r.status);

  console.log("\n== 6. Número nuevo (sin coexistencia)");
  calls.length = 0;
  r = await api("/api/whatsapp/embedded-signup/complete", { method: "POST", body: JSON.stringify({ code: "CODE-NUEVO-0002", wabaId: WABA_NEW, coexistence: false }) });
  j = await r.json();
  check("→ 201 coexistence=false, registered=true", r.status === 201 && j.coexistence === false && j.registered === true, r.status + " " + JSON.stringify(j));
  const acc2 = await prisma.wAAccount.findUnique({ where: { id: j.id } });
  const reg2 = calls.find((c) => c.path === `/${PN_NEW}/register`);
  check("se registró con un PIN de 6 dígitos", !!reg2 && /^\d{6}$/.test(reg2.body.pin) && reg2.body.messaging_product === "whatsapp");
  check("el PIN se guardó cifrado y coincide", acc2 && dec(acc2.twoStepPin) === reg2.body.pin);
  check("sin coexistencia: sin sincronización", acc2 && acc2.coexistence === false && acc2.syncStatus === "NONE" && acc2.syncDeadlineAt === null);
  check("no pidió smb_app_data", !calls.some((c) => c.path.endsWith("/smb_app_data")));

  console.log("\n== 7. Vigilancia (tick de 15 min)");
  const t1 = await prisma.wAAccount.create({ data: { userId: user.id, organizationId: user.organizationId, name: "Token por vencer", phoneNumberId: "PN_T1_" + stamp, accessToken: enc("t"), status: "CONNECTED", connectionType: "EMBEDDED_SIGNUP", tokenExpiresAt: new Date(Date.now() + 5 * 86400000) } });
  const t2 = await prisma.wAAccount.create({ data: { userId: user.id, organizationId: user.organizationId, name: "Token vencido", phoneNumberId: "PN_T2_" + stamp, accessToken: enc("t"), status: "CONNECTED", connectionType: "EMBEDDED_SIGNUP", tokenExpiresAt: new Date(Date.now() - 86400000) } });
  const t3 = await prisma.wAAccount.create({ data: { userId: user.id, organizationId: user.organizationId, name: "Sync vencida", phoneNumberId: "PN_T3_" + stamp, accessToken: enc("t"), status: "CONNECTED", connectionType: "EMBEDDED_SIGNUP", coexistence: true, syncStatus: "PENDING", syncDeadlineAt: new Date(Date.now() - 3600000) } });
  const tq = new Queue("coexistence-tick", { connection: { url: process.env.REDIS_URL } });
  await tq.add("tick", {});
  const a1 = await waitFor(async () => { const a = await prisma.wAAccount.findUnique({ where: { id: t1.id } }); return a.tokenAlertedAt ? a : null; });
  check("token a 5 días: aviso 'vence pronto' y sigue conectada", !!a1 && a1.status === "CONNECTED");
  const a2 = await waitFor(async () => { const a = await prisma.wAAccount.findUnique({ where: { id: t2.id } }); return a.status === "ERROR" ? a : null; });
  check("token vencido: cuenta en ERROR con instrucciones", !!a2 && a2.errorMessage.includes("venció"));
  const a3 = await waitFor(async () => { const a = await prisma.wAAccount.findUnique({ where: { id: t3.id } }); return a.syncStatus === "EXPIRED" ? a : null; });
  check("sincronización sin pedir a las 24 h: EXPIRED", !!a3 && !!a3.syncError);
  check("se avisó a los admins por cada caso", (await prisma.notification.count({ where: { userId: user.id, type: "ACCOUNT_STATUS", OR: [{ title: { contains: "vence pronto" } }, { title: { contains: "venció" } }, { title: { contains: "sincronización vencida" } }] } })) >= 3);

  console.log(`\nResultado: ${pass} bien, ${fail} con falla`);
  await q.close(); await tq.close(); server.close(); await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error("ERROR en la prueba:", e); server.close(); await prisma.$disconnect(); process.exit(3); });
