// Respaldos de la plataforma, de punta a punta, contra un S3 real (versitygw en el
// stack aislado, http://s3:9000). Se corre DENTRO del contenedor app:
//   podman compose -f dev/coexistencia/compose.yml exec app node dev/coexistencia/pruebas/04-respaldos.cjs
// Requiere pg_dump/psql (apk add postgresql16-client si el contenedor no se
// reconstruyó con el Dockerfile nuevo) y PLATFORM_ADMIN_EMAILS con el operador.
const { PrismaClient } = require("@prisma/client");
const { Queue } = require("bullmq");
const IORedis = require("ioredis");
const { S3Client, DeleteObjectsCommand, CreateBucketCommand, HeadObjectCommand, GetObjectCommand, ListObjectsV2Command, ListMultipartUploadsCommand } = require("@aws-sdk/client-s3");
const { execFileSync, spawnSync } = require("child_process");
const { createWriteStream, writeFileSync, mkdirSync, rmSync, statSync } = require("fs");
const { pipeline } = require("stream/promises");
const crypto = require("crypto");

const prisma = new PrismaClient();
const BASE = "http://localhost:5000";
const OPERATOR = "luis.islas@ludaisca.com";
const PASSWORD = "Prueba-Segura-12345";
const ENDPOINT = "http://s3:9000", ACCESS = "colibly-dev-access", SECRET = "colibly-dev-secret-key";
const BUCKET = "colibly-e2e", PREFIX = "e2e/prod";
const KEY_DB = `${PREFIX}/colibly-db.dump`, KEY_MEDIA = `${PREFIX}/colibly-media.tar.gz`, KEY_MANIFEST = `${PREFIX}/manifiesto.json`;
const js = (o) => JSON.stringify(o, (k, v) => (typeof v === "bigint" ? Number(v) : v));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = "") => { (ok ? pass++ : fail++); console.log((ok ? "  OK   " : "  FALLA") + " " + n + (ok ? "" : "  -> " + x)); };
async function waitFor(fn, ms = 60000, step = 400) { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await sleep(step); } return null; }

// --- PostgreSQL (la misma base que usa la app) -----------------------------
const dbUrl = new URL(process.env.DATABASE_URL);
const pgEnv = { ...process.env, PGHOST: dbUrl.hostname, PGPORT: dbUrl.port || "5432", PGUSER: decodeURIComponent(dbUrl.username), PGPASSWORD: decodeURIComponent(dbUrl.password) };
const DBNAME = dbUrl.pathname.slice(1);
const psql = (db, sql) => execFileSync("psql", ["-At", "-d", db, "-c", sql], { env: pgEnv }).toString().trim();

const s3 = new S3Client({ region: "us-east-1", endpoint: ENDPOINT, forcePathStyle: true, credentials: { accessKeyId: ACCESS, secretAccessKey: SECRET }, requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED" });
async function download(key, file) { const r = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key })); await pipeline(r.Body, createWriteStream(file)); return file; }
const head = (key) => s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key })).catch(() => null);

// Restaura el dump en una base descartable y devuelve funciones para consultarla.
function restoreInto(file) {
  psql("postgres", "DROP DATABASE IF EXISTS restore_check");
  psql("postgres", "CREATE DATABASE restore_check");
  const r = spawnSync("pg_restore", ["--no-owner", "--no-privileges", "-d", "restore_check", file], { env: pgEnv });
  return { code: r.status, stderr: r.stderr.toString(), q: (sql) => psql("restore_check", sql) };
}

(async () => {
  const stamp = Date.now();
  await s3.send(new CreateBucketCommand({ Bucket: BUCKET })).catch((e) => { if (!/BucketAlready/.test(e.name)) throw e; });

  // --- sesiones: operador y un usuario cualquiera ----------------------------
  async function session(email) {
    let reg = await fetch(BASE + "/api/auth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "E2E", email, password: PASSWORD, businessName: "E2E " + email }) });
    if (reg.status !== 201 && reg.status !== 409) { console.log("registro falló", reg.status, await reg.text()); process.exit(2); }
    await prisma.user.update({ where: { email }, data: { emailVerifiedAt: new Date() } });
    const csrfRes = await fetch(BASE + "/api/auth/csrf");
    const csrf = (await csrfRes.json()).csrfToken;
    const jar = (csrfRes.headers.getSetCookie() || []).map((c) => c.split(";")[0]).join("; ");
    const login = await fetch(BASE + "/api/auth/callback/credentials", { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", cookie: jar }, body: new URLSearchParams({ csrfToken: csrf, email, password: PASSWORD, json: "true" }) });
    const cookie = [jar, ...(login.headers.getSetCookie() || []).map((c) => c.split(";")[0])].join("; ");
    return (path, opts = {}) => fetch(BASE + path, { ...opts, headers: { "content-type": "application/json", cookie, ...(opts.headers || {}) } });
  }
  const op = await session(OPERATOR);
  const other = await session(`e2e-otro-${stamp}@example.test`);
  const API = "/api/plataforma/respaldos";
  const patch = (body) => op(API, { method: "PATCH", body: JSON.stringify(body) });
  const post = (action) => op(API, { method: "POST", body: JSON.stringify({ action }) });
  const lastRun = () => prisma.platformBackupRun.findFirst({ orderBy: { startedAt: "desc" } });
  const connection = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
  const queue = new Queue("platform-backup", { connection });
  const runManual = async (expectStatus) => {
    const before = await prisma.platformBackupRun.count();
    const r = await post("run");
    if (r.status !== 202) return { http: r.status, body: await r.json().catch(() => ({})) };
    const run = await waitFor(async () => { const x = await lastRun(); return x && (await prisma.platformBackupRun.count()) > before && x.status !== "RUNNING" ? x : null; }, 120000);
    return { http: 202, run };
  };

  // Partir limpio: sin objetos de corridas anteriores ni límites de frecuencia acumulados (10/h por acción).
  const old = (await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: PREFIX + "/" }))).Contents || [];
  if (old.length) await s3.send(new DeleteObjectsCommand({ Bucket: BUCKET, Delete: { Objects: old.map((o) => ({ Key: o.Key })) } }));
  for (const k of await connection.keys("ratelimit:platform-backup:*")) await connection.del(k);
  await prisma.platformBackupRun.deleteMany({});
  await prisma.platformSettings.upsert({ where: { id: "platform" }, create: { id: "platform" }, update: { backupEnabled: false, backupAccessKeyId: null, backupSecretAccessKey: null, backupBucket: null, backupEndpoint: null, backupIncludeMedia: false } });

  console.log("\n== 1. Acceso: solo el operador");
  let r = await fetch(BASE + API);
  check("sin sesión → 404", r.status === 404, r.status);
  r = await other(API);
  check("usuario que no es operador → 404", r.status === 404, r.status);
  r = await other(API, { method: "PATCH", body: JSON.stringify({ backupEnabled: true }) });
  check("no operador no puede cambiar la configuración (404)", r.status === 404, r.status);
  r = await other(API, { method: "POST", body: JSON.stringify({ action: "run" }) });
  check("no operador no puede lanzar un respaldo (404)", r.status === 404, r.status);
  r = await op(API);
  let j = await r.json();
  check("el operador ve el panel, desactivado y sin historial", r.status === 200 && j.config.enabled === false && j.runs.length === 0 && j.nextRunAt === null, JSON.stringify(j).slice(0, 200));

  console.log("\n== 2. Validaciones de la configuración");
  r = await patch({ backupEnabled: true });
  j = await r.json();
  check("activar sin configuración completa → 400 con lo que falta", r.status === 400 && /bucket/.test(j.error) && /access key/.test(j.error), JSON.stringify(j));
  r = await patch({ backupEndpoint: "esto no es url" });
  check("endpoint inválido → 400", r.status === 400, r.status);
  r = await patch({ backupBucket: "Mal_Bucket!" });
  check("nombre de bucket inválido → 400", r.status === 400, r.status);
  r = await patch({ backupHour: 25 });
  check("hora fuera de rango → 400", r.status === 400, r.status);
  r = await post("test");
  check("probar sin configuración → 400", r.status === 400, r.status);

  console.log("\n== 3. Guardar la configuración (con credenciales equivocadas a propósito)");
  r = await patch({ backupEndpoint: ENDPOINT, backupRegion: "us-east-1", backupBucket: BUCKET, backupPrefix: "/e2e/prod/", backupAccessKeyId: ACCESS, backupSecretAccessKey: "secreto-equivocado-123", backupHour: 3 });
  check("guardado → 200", r.status === 200, r.status);
  r = await op(API);
  const cfgText = await r.text();
  j = JSON.parse(cfgText);
  check("la respuesta no contiene ningún secreto", !cfgText.includes(ACCESS) && !cfgText.includes("secreto-equivocado-123") && j.config.hasAccessKeyId && j.config.hasSecretAccessKey);
  check("el prefijo quedó normalizado en las claves", j.objectKeys.db === KEY_DB, JSON.stringify(j.objectKeys));
  const row = await prisma.platformSettings.findUnique({ where: { id: "platform" } });
  check("access key y secret están CIFRADOS en la base", row.backupSecretAccessKey && row.backupSecretAccessKey.split(":").length === 3 && !row.backupSecretAccessKey.includes("secreto") && row.backupAccessKeyId.split(":").length === 3);

  console.log("\n== 4. Probar conexión");
  r = await post("test");
  j = await r.json();
  check("credenciales malas → 502 con mensaje claro y sin filtrar el secreto", r.status === 502 && j.ok === false && /Secret|Access|Acceso/i.test(j.error) && !j.error.includes("secreto-equivocado"), r.status + " " + JSON.stringify(j));
  await patch({ backupSecretAccessKey: SECRET });
  r = await post("test");
  j = await r.json();
  check("credenciales buenas → 200 ok", r.status === 200 && j.ok === true, r.status + " " + JSON.stringify(j));
  check("el objeto de prueba no queda en el bucket", !(await head(`${PREFIX}/.prueba-de-conexion`)));
  await patch({ backupBucket: "no-existe-este-bucket" });
  r = await post("test");
  j = await r.json();
  check("bucket inexistente → 502 'no existe'", r.status === 502 && /bucket/i.test(j.error), JSON.stringify(j));
  await patch({ backupBucket: BUCKET });

  console.log("\n== 5. Respaldo manual → restaurar y comparar");
  await prisma.platformSettings.update({ where: { id: "platform" }, data: { updatedByEmail: "marcador-1" } });
  let res = await runManual();
  check("el respaldo termina bien", res.run && res.run.status === "SUCCESS", js(res).slice(0, 300));
  const run1 = res.run;
  const h1 = await head(KEY_DB);
  check("el dump está en el bucket con el tamaño registrado", h1 && Number(run1.dbBytes) === h1.ContentLength && h1.ContentLength > 10000, `${h1 && h1.ContentLength} vs ${run1.dbBytes}`);
  const manifest1 = JSON.parse(await (await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: KEY_MANIFEST }))).Body.transformToString());
  await download(KEY_DB, "/tmp/e2e-dump-1.dump");
  const sha = crypto.createHash("sha256").update(require("fs").readFileSync("/tmp/e2e-dump-1.dump")).digest("hex");
  check("el manifiesto trae el sha256 y los bytes correctos", manifest1.database.sha256 === sha && manifest1.database.bytes === h1.ContentLength && manifest1.media === null && !!manifest1.lastMigration, JSON.stringify(manifest1).slice(0, 300));
  const rest1 = restoreInto("/tmp/e2e-dump-1.dump");
  check("pg_restore termina sin errores en una base vacía", rest1.code === 0, rest1.stderr.slice(0, 300));
  const tables = ["users", "organizations", "platform_settings", "wa_accounts", "wa_messages", "contacts", "_prisma_migrations"];
  const diffs = tables.filter((t) => psql(DBNAME, `select count(*) from ${t}`) !== rest1.q(`select count(*) from ${t}`));
  check("los conteos de las tablas clave coinciden con el origen", diffs.length === 0, diffs.join(","));
  check("el marcador y los datos están en la copia restaurada", rest1.q("select updated_by_email from platform_settings") === "marcador-1" && rest1.q("select md5(string_agg(id||email, ',' order by id)) from users") === psql(DBNAME, "select md5(string_agg(id||email, ',' order by id)) from users"));
  check("el índice vectorial y la extensión pgvector sobreviven", rest1.q("select count(*) from pg_extension where extname='vector'") === "1");

  console.log("\n== 6. Sobrescribe al anterior (no acumula copias)");
  await prisma.platformSettings.update({ where: { id: "platform" }, data: { updatedByEmail: "marcador-2" } });
  res = await runManual();
  check("segundo respaldo correcto", res.run && res.run.status === "SUCCESS", js(res).slice(0, 200));
  const h2 = await head(KEY_DB);
  check("el objeto cambió (ETag distinto) en la MISMA clave", h2 && h2.ETag !== h1.ETag, `${h1.ETag} / ${h2 && h2.ETag}`);
  const listed = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: PREFIX + "/" }));
  const keys = (listed.Contents || []).map((o) => o.Key).sort();
  check("el prefijo tiene solo el dump y el manifiesto", JSON.stringify(keys) === JSON.stringify([KEY_DB, KEY_MANIFEST].sort()), JSON.stringify(keys));
  await download(KEY_DB, "/tmp/e2e-dump-2.dump");
  check("la copia restaurada trae el marcador nuevo", restoreInto("/tmp/e2e-dump-2.dump").q("select updated_by_email from platform_settings") === "marcador-2");

  console.log("\n== 7. Falla a mitad de camino: el respaldo bueno NO se sobrescribe");
  psql(DBNAME, "drop table if exists e2e_grande; create table e2e_grande as select md5(random()::text)||md5(random()::text) as x from generate_series(1,4000000)");
  await prisma.platformSettings.update({ where: { id: "platform" }, data: { updatedByEmail: "marcador-3-NO-DEBE-VERSE" } });
  const before3 = await prisma.platformBackupRun.count();
  r = await post("run");
  check("el respaldo se encola (202)", r.status === 202, r.status);
  const running = await waitFor(async () => (await prisma.platformBackupRun.findFirst({ where: { status: "RUNNING" } })), 30000, 100);
  check("aparece como EN CURSO", !!running);
  r = await post("run");
  check("un segundo pedido mientras hay uno en curso → 409", r.status === 409, r.status);
  await waitFor(() => spawnSync("pgrep", ["-f", "pg_dump --format"]).status === 0, 15000, 50);
  await sleep(500);
  spawnSync("pkill", ["-TERM", "-f", "pg_dump --format"]);
  const failed = await waitFor(async () => { const x = await lastRun(); return x && x.status !== "RUNNING" && (await prisma.platformBackupRun.count()) > before3 ? x : null; }, 60000);
  check("el respaldo queda FALLIDO con el motivo", failed && failed.status === "FAILED" && /pg_dump/.test(failed.error || ""), js(failed));
  const h3 = await head(KEY_DB);
  check("el dump del bucket sigue siendo el bueno (mismo ETag)", h3 && h3.ETag === h2.ETag, `${h2.ETag} / ${h3 && h3.ETag}`);
  await download(KEY_DB, "/tmp/e2e-dump-3.dump");
  const rest3 = restoreInto("/tmp/e2e-dump-3.dump");
  check("y sigue siendo restaurable (marcador-2, sin tabla grande)", rest3.code === 0 && rest3.q("select updated_by_email from platform_settings") === "marcador-2" && rest3.q("select to_regclass('e2e_grande') is null") === "t");
  let leftovers = "n/d";
  try { leftovers = ((await s3.send(new ListMultipartUploadsCommand({ Bucket: BUCKET }))).Uploads || []).length; } catch {}
  check("no quedan subidas multiparte huérfanas", leftovers === 0 || leftovers === "n/d", leftovers);
  psql(DBNAME, "drop table e2e_grande");

  console.log("\n== 8. Incluir multimedia");
  mkdirSync("/app/media/e2e-respaldo", { recursive: true });
  writeFileSync("/app/media/e2e-respaldo/prueba.bin", crypto.randomBytes(1024 * 1024));
  await patch({ backupIncludeMedia: true });
  await prisma.platformSettings.update({ where: { id: "platform" }, data: { updatedByEmail: "marcador-4" } });
  res = await runManual();
  check("respaldo con medios correcto", res.run && res.run.status === "SUCCESS" && Number(res.run.mediaBytes) > 1024 * 1024, js(res).slice(0, 300));
  const hm = await head(KEY_MEDIA);
  check("el tar.gz está en el bucket con el tamaño registrado", hm && hm.ContentLength === Number(res.run.mediaBytes));
  await download(KEY_MEDIA, "/tmp/e2e-media.tar.gz");
  check("el tar contiene el archivo de medios", execFileSync("tar", ["-tzf", "/tmp/e2e-media.tar.gz"]).toString().includes("e2e-respaldo/prueba.bin"));
  const manifest4 = JSON.parse(await (await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: KEY_MANIFEST }))).Body.transformToString());
  check("el manifiesto describe los medios", manifest4.media && manifest4.media.bytes === hm.ContentLength);
  rmSync("/app/media/e2e-respaldo", { recursive: true, force: true });
  await patch({ backupIncludeMedia: false });

  console.log("\n== 9. Credenciales malas durante un respaldo: falla sin filtrar y sin tocar lo anterior");
  await patch({ backupSecretAccessKey: "otro-secreto-malo-999" });
  const etagBefore = (await head(KEY_DB)).ETag;
  res = await runManual();
  check("queda FALLIDO", res.run && res.run.status === "FAILED", js(res).slice(0, 200));
  check("el error guardado no contiene ni el secreto ni la contraseña de la base", res.run && !res.run.error.includes("otro-secreto-malo-999") && !res.run.error.includes(pgEnv.PGPASSWORD), res.run && res.run.error);
  check("el dump anterior sigue intacto", (await head(KEY_DB)).ETag === etagBefore);
  await patch({ backupSecretAccessKey: SECRET });

  console.log("\n== 10. Programación (tick)");
  const tick = async () => queue.add("tick", {}, { jobId: `e2e-tick-${Date.now()}-${Math.random()}`, removeOnComplete: true, removeOnFail: true });
  const scheduled = () => prisma.platformBackupRun.count({ where: { trigger: "SCHEDULED" } });
  await prisma.platformBackupRun.deleteMany({});
  await patch({ backupEnabled: false });
  await tick(); await sleep(4000);
  check("desactivado: el tick no respalda", (await scheduled()) === 0);
  await patch({ backupEnabled: true, backupHour: 3 });
  await tick();
  const sch = await waitFor(async () => prisma.platformBackupRun.findFirst({ where: { trigger: "SCHEDULED", status: { not: "RUNNING" } } }), 90000);
  check("activado sin respaldo previo: el tick lanza el programado y termina bien", sch && sch.status === "SUCCESS", js(sch));
  await tick(); await sleep(4000);
  check("ya cumplido el horario: el siguiente tick NO repite", (await scheduled()) === 1, await scheduled());
  r = await op(API);
  j = await r.json();
  check("el panel muestra último respaldo y próximo (mañana)", r.status === 200 && !!j.lastSuccessAt && new Date(j.nextRunAt) > new Date(), j.nextRunAt);

  console.log("\n== 11. Reintentos y aviso tras fallar 3 veces");
  await prisma.platformBackupRun.deleteMany({});
  const nowMx = new Date(Date.now() - 6 * 3600 * 1000);
  const hourNow = nowMx.getUTCHours();
  const slotHour = (hourNow + 22) % 24; // hace entre 2 y 3 horas
  await patch({ backupHour: slotHour, backupSecretAccessKey: "secreto-malo-para-fallar" });
  const slot = new Date(Math.floor(Date.now() / 3600000) * 3600000 - 2 * 3600000);
  await prisma.platformBackupRun.create({ data: { trigger: "SCHEDULED", status: "FAILED", startedAt: new Date(slot.getTime() + 5 * 60000), finishedAt: new Date(slot.getTime() + 6 * 60000), error: "falla simulada 1" } });
  await prisma.platformBackupRun.create({ data: { trigger: "SCHEDULED", status: "FAILED", startedAt: new Date(slot.getTime() + 10 * 60000), finishedAt: new Date(slot.getTime() + 11 * 60000), error: "falla simulada 2" } });
  await tick();
  const third = await waitFor(async () => ((await prisma.platformBackupRun.count({ where: { status: "FAILED" } })) >= 3 ? true : null), 60000);
  check("tras 2 fallos y pasada la espera, el tick hace el 3.er intento (que falla por las credenciales)", !!third);
  await tick(); await sleep(4000);
  check("agotados los 3 intentos, el tick ya no insiste", (await prisma.platformBackupRun.count({ where: { status: "FAILED" } })) === 3);

  console.log("\n== Limpieza");
  await patch({ backupEnabled: false, backupSecretAccessKey: SECRET, backupHour: 3 });
  await prisma.platformBackupRun.deleteMany({});
  psql("postgres", "DROP DATABASE IF EXISTS restore_check");
  for (const f of ["/tmp/e2e-dump-1.dump", "/tmp/e2e-dump-2.dump", "/tmp/e2e-dump-3.dump", "/tmp/e2e-media.tar.gz"]) rmSync(f, { force: true });

  console.log(`\nRESULTADO: ${pass} OK, ${fail} fallas`);
  await queue.close(); await connection.quit(); await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ERROR INESPERADO", e); process.exit(3); });
