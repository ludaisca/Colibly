// Prueba de punta a punta de la coexistencia contra el stack aislado.
// Se ejecuta DENTRO del contenedor: node - < e2e.cjs
const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");
const prisma = new PrismaClient();
const KEY = Buffer.from(process.env.ENCRYPTION_KEY, "hex");
const enc = (t) => {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", KEY, iv, { authTagLength: 16 });
  const e = Buffer.concat([c.update(t, "utf8"), c.final()]);
  return iv.toString("hex") + ":" + c.getAuthTag().toString("hex") + ":" + e.toString("hex");
};
const BASE = "http://localhost:5000";
const PLATFORM = "e2e-platform-secret";
const MANUAL = "e2e-manual-secret";
const sign = (body, secret) => "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (name, ok, extra = "") => { (ok ? pass++ : fail++); console.log((ok ? "  OK   " : "  FALLA") + " " + name + (ok ? "" : "  -> " + extra)); };
async function waitFor(fn, ms = 15000) { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await sleep(500); } return null; }
async function hook(obj, secret, validSig = true) {
  const body = JSON.stringify(obj);
  const r = await fetch(BASE + "/api/whatsapp/webhook", { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": validSig ? sign(body, secret) : "sha256=" + "0".repeat(64) }, body });
  return r.status;
}
const wrap = (wabaId, phoneNumberId, display, field, value) => ({ object: "whatsapp_business_account", entry: [{ id: wabaId, changes: [{ field, value: { messaging_product: "whatsapp", metadata: { display_phone_number: display, phone_number_id: phoneNumberId }, ...value } }] }] });

(async () => {
  const stamp = Date.now();
  const email = `e2e${stamp}@example.test`;
  const reg = await fetch(BASE + "/api/auth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "E2E", email, password: "Prueba-Segura-12345", businessName: "E2E " + stamp }) });
  if (reg.status !== 201) { console.log("registro falló", reg.status, await reg.text()); process.exit(2); }
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, organizationId: true } });
  await prisma.organization.update({ where: { id: user.organizationId }, data: { whatsappCoexistenceEnabled: true } });
  await prisma.platformSettings.upsert({
    where: { id: "platform" },
    create: { id: "platform", metaAppId: "3423949611118312", metaAppSecret: enc(PLATFORM), metaEmbeddedSignupConfigId: "1676025620523858", metaWebhookVerifyToken: enc("verifytoken123") },
    update: { metaAppId: "3423949611118312", metaAppSecret: enc(PLATFORM), metaEmbeddedSignupConfigId: "1676025620523858", metaWebhookVerifyToken: enc("verifytoken123") },
  });
  // Dejar que el caché de 30 s de PlatformSettings no estorbe: el contenedor acaba de reiniciar.
  const base = { userId: user.id, organizationId: user.organizationId, accessToken: enc("TOKEN-DE-PRUEBA"), status: "CONNECTED" };
  const A = await prisma.wAAccount.create({ data: { ...base, name: "Coex " + stamp, phoneNumberId: "PN_A_" + stamp, wabaId: "WABA_A_" + stamp, phoneNumber: "15550001111", connectionType: "EMBEDDED_SIGNUP", coexistence: true, syncStatus: "HISTORY_REQUESTED", syncProgress: 0 } });
  const B = await prisma.wAAccount.create({ data: { ...base, name: "Coex B " + stamp, phoneNumberId: "PN_B_" + stamp, wabaId: "WABA_B_" + stamp, phoneNumber: "15550002222", connectionType: "EMBEDDED_SIGNUP", coexistence: true, syncStatus: "HISTORY_REQUESTED", syncProgress: 0 } });
  const M = await prisma.wAAccount.create({ data: { ...base, name: "Manual " + stamp, phoneNumberId: "PN_M_" + stamp, wabaId: "WABA_M_" + stamp, phoneNumber: "15550003333", connectionType: "MANUAL", appSecret: enc(MANUAL) } });
  const D = await prisma.wAAccount.create({ data: { ...base, name: "Borrar " + stamp, phoneNumberId: "PN_D_" + stamp, wabaId: "WABA_D_" + stamp, phoneNumber: "15550004444", connectionType: "EMBEDDED_SIGNUP", metaUserId: "FBUSER_DEL_" + stamp } });
  const U = await prisma.wAAccount.create({ data: { ...base, name: "Desautorizar " + stamp, phoneNumberId: "PN_U_" + stamp, wabaId: "WABA_U_" + stamp, phoneNumber: "15550005555", connectionType: "EMBEDDED_SIGNUP", metaUserId: "FBUSER_DEAUTH_" + stamp } });

  console.log("(esperando 32 s a que expire el caché de 30 s de PlatformSettings…)");
  await sleep(32000);
  console.log("\n== 1. Verificación GET del webhook");
  let r = await fetch(BASE + "/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verifytoken123&hub.challenge=hola123");
  check("token global de plataforma → 200 y devuelve el challenge", r.status === 200 && (await r.text()) === "hola123", r.status);
  r = await fetch(BASE + "/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=incorrecto&hub.challenge=x");
  check("token incorrecto → 403", r.status === 403, r.status);

  console.log("\n== 2. Firma: cuenta de plataforma vs cuenta manual");
  const echo = (ts, id, text) => wrap(A.wabaId, A.phoneNumberId, "15550001111", "smb_message_echoes", { message_echoes: [{ from: "15550001111", to: "5215568623317", id, timestamp: String(ts), type: "text", text: { body: text } }] });
  await hook(echo(1790000000, "wamid.ECO_FIRMA_MALA", "x"), PLATFORM, false);
  await sleep(800);
  check("eco con firma inválida NO se guarda", (await prisma.wAMessage.count({ where: { wamid: "wamid.ECO_FIRMA_MALA" } })) === 0);
  await hook(echo(1790000000, "wamid.ECO_FIRMA_MANUAL", "x"), MANUAL, true);
  await sleep(800);
  check("eco de cuenta de plataforma firmado con secreto de un cliente NO se guarda", (await prisma.wAMessage.count({ where: { wamid: "wamid.ECO_FIRMA_MANUAL" } })) === 0);
  const inbound = (id) => wrap(M.wabaId, M.phoneNumberId, "15550003333", "messages", { contacts: [{ profile: { name: "Cliente M" }, wa_id: "5215500001111" }], messages: [{ from: "5215500001111", id, timestamp: "1790000000", type: "text", text: { body: "hola manual" } }] });
  await hook(inbound("wamid.M_OK"), MANUAL, true);
  await hook(inbound("wamid.M_MALA"), PLATFORM, true);
  await sleep(1500);
  check("cuenta MANUAL sigue funcionando con su propio secreto", (await prisma.wAMessage.count({ where: { wamid: "wamid.M_OK" } })) === 1);
  check("cuenta MANUAL rechaza la firma de la plataforma", (await prisma.wAMessage.count({ where: { wamid: "wamid.M_MALA" } })) === 0);

  console.log("\n== 3. Eco desde la app del teléfono");
  const s1 = await hook(echo(1790000100, "wamid.ECO1", "Te lo mando hoy"), PLATFORM, true);
  const m = await waitFor(() => prisma.wAMessage.findFirst({ where: { wamid: "wamid.ECO1", chat: { accountId: A.id } }, include: { chat: true } }));
  check("webhook responde 200", s1 === 200, s1);
  check("eco guardado como OUTBOUND / BUSINESS_APP_ECHO / sin sender", !!m && m.direction === "OUTBOUND" && m.origin === "BUSINESS_APP_ECHO" && m.senderId === null, JSON.stringify(m && { d: m.direction, o: m.origin }));
  check("chat creado para el cliente y sin mensajes sin leer", !!m && m.chat.remoteJid === "5215568623317" && m.chat.unreadCount === 0, m && m.chat.unreadCount);
  check("última actividad del chat = texto del eco", !!m && m.chat.lastMessage === "Te lo mando hoy");
  await hook(echo(1790000100, "wamid.ECO1", "Te lo mando hoy"), PLATFORM, true);
  await sleep(800);
  check("reintento del mismo eco no duplica", (await prisma.wAMessage.count({ where: { wamid: "wamid.ECO1", chat: { accountId: A.id } } })) === 1);
  // mismo cliente escrito sin el 1 de México → no debe duplicar el chat
  await hook(wrap(A.wabaId, A.phoneNumberId, "15550001111", "smb_message_echoes", { message_echoes: [{ from: "15550001111", to: "525568623317", id: "wamid.ECO2", timestamp: "1790000200", type: "text", text: { body: "Segundo" } }] }), PLATFORM, true);
  await waitFor(() => prisma.wAMessage.findFirst({ where: { wamid: "wamid.ECO2", chat: { accountId: A.id } } }));
  check("México 52… vs 521…: un solo chat", (await prisma.wAChat.count({ where: { accountId: A.id, remoteJid: { in: ["525568623317", "5215568623317"] } } })) === 1);
  check("los ecos no generan notificaciones", (await prisma.notification.count({ where: { userId: user.id, type: "CHAT_MESSAGE" } })) === 0);

  console.log("\n== 4. Historial");
  const history = (progress, msgs, phase = 0, chunk = 1) => wrap(A.wabaId, A.phoneNumberId, "15550001111", "history", { history: [{ metadata: { phase, chunk_order: chunk, progress }, threads: [{ id: "5215599990000", messages: msgs }] }] });
  const hmsgs = [
    { from: "5215599990000", id: "wamid.H1", timestamp: "1789000000", type: "text", text: { body: "Hola, ¿precio?" }, history_context: { status: "READ" } },
    { from: "15550001111", to: "5215599990000", id: "wamid.H2", timestamp: "1789000100", type: "text", text: { body: "$450 MXN" }, history_context: { status: "DELIVERED" } },
    { from: "15550001111", to: "5215599990000", id: "wamid.H3", timestamp: "1789000200", type: "media_placeholder", history_context: { status: "SENT" } },
  ];
  await hook(history(55, hmsgs), PLATFORM, true);
  const h3 = await waitFor(() => prisma.wAMessage.findFirst({ where: { wamid: "wamid.H3", chat: { accountId: A.id } } }));
  const accA1 = await waitFor(async () => { const a = await prisma.wAccountDummy; return null; }, 1).catch(() => null);
  const acc = await waitFor(async () => { const a = await prisma.wAAccount.findUnique({ where: { id: A.id } }); return a.syncProgress === 55 ? a : null; });
  check("3 mensajes de historial importados", (await prisma.wAMessage.count({ where: { origin: "HISTORY", chat: { accountId: A.id } } })) === 3);
  const inH = await prisma.wAMessage.findFirst({ where: { wamid: "wamid.H1", chat: { accountId: A.id } } });
  check("direcciones correctas (cliente→entrante, negocio→saliente)", inH.direction === "INBOUND" && (await prisma.wAMessage.findFirst({ where: { wamid: "wamid.H2", chat: { accountId: A.id } } })).direction === "OUTBOUND");
  check("estado de entrega del historial mapeado", inH.status === "read");
  check("progreso 55 guardado y sigue HISTORY_REQUESTED", !!acc && acc.syncStatus === "HISTORY_REQUESTED");
  check("el historial no crea notificaciones ni mensajes sin leer", (await prisma.wAChat.findFirst({ where: { accountId: A.id, remoteJid: "5215599990000" } })).unreadCount === 0);
  check("el historial viejo no pisa la actividad del chat", !!h3);
  // el medio llega en otro webhook
  await hook(history(100, [{ from: "15550001111", to: "5215599990000", id: "wamid.H3", timestamp: "1789000200", type: "image", image: { id: "MEDIA1", mime_type: "image/jpeg", caption: "foto" }, history_context: { status: "SENT" } }], 2, 9), PLATFORM, true);
  const done = await waitFor(async () => { const a = await prisma.wAAccount.findUnique({ where: { id: A.id } }); return a.syncStatus === "COMPLETED" ? a : null; });
  check("progreso 100 → COMPLETED", !!done && done.syncProgress === 100);
  const h3b = await prisma.wAMessage.findFirst({ where: { wamid: "wamid.H3", chat: { accountId: A.id } } });
  check("el placeholder de medio se completa con su contenido", h3b.messageType === "image" && h3b.mediaId === "MEDIA1" && h3b.caption === "foto");

  console.log("\n== 5. Historial rechazado por el negocio");
  await hook(wrap(B.wabaId, B.phoneNumberId, "15550002222", "history", { history: [{ errors: [{ code: 2593109, title: "History sync is turned off by the business from the WhatsApp Business App", message: "off", error_data: { details: "History sharing is turned off by the business" } }] }] }), PLATFORM, true);
  const dec = await waitFor(async () => { const a = await prisma.wAAccount.findUnique({ where: { id: B.id } }); return a.syncStatus === "HISTORY_DECLINED" ? a : null; });
  check("error 2593109 → HISTORY_DECLINED", !!dec);

  console.log("\n== 6. Contactos de la libreta del teléfono");
  await hook(wrap(A.wabaId, A.phoneNumberId, "15550001111", "smb_app_state_sync", { state_sync: [{ type: "contact", contact: { full_name: "Pablo Morales", first_name: "Pablo", phone_number: "5215599990000" }, action: "add", metadata: { timestamp: "1738346006" } }, { type: "contact", contact: { full_name: "Nueva Persona", first_name: "Nueva", phone_number: "5215588880000" }, action: "add", metadata: { timestamp: "1738346007" } }] }), PLATFORM, true);
  const nuevo = await waitFor(() => prisma.contact.findFirst({ where: { accountId: A.id, remoteJid: "5215588880000" } }));
  check("contacto nuevo creado con su nombre", !!nuevo && nuevo.name === "Nueva Persona");
  await sleep(800);
  const pablo = await prisma.contact.findFirst({ where: { accountId: A.id, remoteJid: "5215599990000" } });
  check("contacto existente (solo con teléfono como nombre) recibe su nombre real", !!pablo && pablo.name === "Pablo Morales", pablo && pablo.name);

  console.log("\n== 7. Desconexión desde la app (account_update)");
  await hook({ object: "whatsapp_business_account", entry: [{ id: A.wabaId, changes: [{ field: "account_update", value: { event: "PARTNER_REMOVED", phone_number: "15550001111", disconnection_info: { reason: "ACCOUNT_DISCONNECTED", initiated_by: "USER" } } }] }] }, PLATFORM, true);
  const disc = await waitFor(async () => { const a = await prisma.wAAccount.findUnique({ where: { id: A.id } }); return a.status === "DISCONNECTED" ? a : null; });
  check("PARTNER_REMOVED → DISCONNECTED con motivo", !!disc && disc.disconnectedReason === "ACCOUNT_DISCONNECTED");
  check("se avisa a los admins de la organización", (await prisma.notification.count({ where: { userId: user.id, type: "ACCOUNT_STATUS", title: { contains: "se desconectó" } } })) >= 1);

  console.log("\n== 8. Callbacks firmados de Meta");
  const sr = (uid, secret) => { const p = Buffer.from(JSON.stringify({ algorithm: "HMAC-SHA256", user_id: uid, issued_at: 1 })).toString("base64url"); return crypto.createHmac("sha256", secret).update(p).digest().toString("base64url") + "." + p; };
  const form = (v) => new URLSearchParams({ signed_request: v });
  r = await fetch(BASE + "/api/meta/deauthorize", { method: "POST", body: form(sr("FBUSER_DEAUTH_" + stamp, "otro-secreto")) });
  check("desautorización con firma falsa → 400", r.status === 400, r.status);
  r = await fetch(BASE + "/api/meta/deauthorize", { method: "POST", body: form(sr("FBUSER_DEAUTH_" + stamp, PLATFORM)) });
  check("desautorización válida → 200", r.status === 200, r.status);
  check("la cuenta del usuario desautorizado queda DISCONNECTED", (await prisma.wAAccount.findUnique({ where: { id: U.id } })).status === "DISCONNECTED");
  r = await fetch(BASE + "/api/meta/data-deletion", { method: "POST", body: form(sr("FBUSER_DEL_" + stamp, "otro-secreto")) });
  check("eliminación con firma falsa → 400 y no borra nada", r.status === 400 && !!(await prisma.wAAccount.findUnique({ where: { id: D.id } })), r.status);
  r = await fetch(BASE + "/api/meta/data-deletion", { method: "POST", body: form(sr("FBUSER_DEL_" + stamp, PLATFORM)) });
  const delJson = await r.json().catch(() => ({}));
  check("eliminación válida → 200 con url y confirmation_code", r.status === 200 && !!delJson.url && /^[a-f0-9]{24}$/.test(delJson.confirmation_code || ""), JSON.stringify(delJson));
  check("la cuenta del usuario se borró", (await prisma.wAAccount.findUnique({ where: { id: D.id } })) === null);
  check("las demás cuentas NO se tocaron", !!(await prisma.wAAccount.findUnique({ where: { id: M.id } })) && !!(await prisma.wAAccount.findUnique({ where: { id: A.id } })));
  const page = await fetch(BASE + "/eliminacion-de-datos/" + delJson.confirmation_code);
  const html = await page.text();
  check("página pública de estado responde y muestra 'Completada'", page.status === 200 && html.includes("Completada"), page.status);
  const none = await fetch(BASE + "/eliminacion-de-datos/" + "0".repeat(24));
  check("código inexistente → 404", none.status === 404, none.status);
  r = await fetch(BASE + "/api/meta/data-deletion", { method: "POST", body: form(sr("USUARIO_SIN_DATOS", PLATFORM)) });
  const j2 = await r.json();
  const req2 = await prisma.metaDataDeletionRequest.findUnique({ where: { confirmationCode: j2.confirmation_code } });
  check("usuario sin cuentas → solicitud NO_DATA", !!req2 && req2.status === "NO_DATA" && req2.accountsDeleted === 0);

  console.log(`\nResultado: ${pass} bien, ${fail} con falla`);
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error("ERROR en la prueba:", e); await prisma.$disconnect(); process.exit(3); });
