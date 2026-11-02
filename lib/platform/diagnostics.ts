import type { PlanId } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getPlatformSettings } from "@/lib/platform-settings";
import { getRedisClient } from "@/lib/redis";
import { getStripe, priceIdFor } from "@/lib/billing/stripe";
import { PLAN_LOOKUP_KEYS, priceMatchesPlan } from "@/lib/billing/stripe-rules";
import { PLANS } from "@/lib/billing/plans";
import { backupFreshness } from "@/lib/backups/freshness";
import {
  appointmentReminderQueue,
  automationTickQueue,
  billingTickQueue,
  campaignScheduleQueue,
  coexistenceTickQueue,
  inboxQueue,
  leadRecoveryQueue,
  leadScoringQueue,
  leadSheetImportQueue,
  mediaCleanupQueue,
  platformBackupQueue,
  platformHealthQueue,
  sequenceQueue,
  sheetsSyncQueue,
} from "@/lib/queue";

// Doctor de la plataforma: responde "¿está sana producción?" sin secretos y
// sin efectos secundarios. Las verificaciones contra Stripe/SMTP son opt-in
// (`live`), porque agregan latencia y llamadas externas.

export type DiagnosticStatus = "ok" | "warn" | "fail" | "unknown";

export interface DiagnosticCheck {
  id: string;
  label: string;
  status: DiagnosticStatus;
  message: string;
  hint?: string;
  details?: Record<string, unknown>;
}

export interface DiagnosticsReport {
  status: DiagnosticStatus;
  checkedAt: string;
  live: boolean;
  checks: DiagnosticCheck[];
}

const SEVERITY: Record<DiagnosticStatus, number> = { ok: 0, unknown: 1, warn: 2, fail: 3 };
const PLAN_IDS: PlanId[] = ["ESSENTIAL", "BUSINESS", "PRO"];

function check(
  id: string,
  label: string,
  status: DiagnosticStatus,
  message: string,
  hint?: string,
  details?: Record<string, unknown>
): DiagnosticCheck {
  return { id, label, status, message, ...(hint ? { hint } : {}), ...(details ? { details } : {}) };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Error desconocido";
}

function worstStatus(checks: DiagnosticCheck[]): DiagnosticStatus {
  return checks.reduce<DiagnosticStatus>((worst, item) => (SEVERITY[item.status] > SEVERITY[worst] ? item.status : worst), "ok");
}

export async function getPlatformDiagnostics(opts: { live?: boolean; now?: Date } = {}): Promise<DiagnosticsReport> {
  const live = opts.live === true;
  const now = opts.now ?? new Date();
  const settings = await getPlatformSettings();
  const appUrl = process.env.APP_URL?.replace(/\/+$/, "") ?? "";
  const isProduction = process.env.NODE_ENV === "production";

  const checks = await Promise.all([
    checkAppUrl(appUrl, isProduction),
    checkMigrations(),
    checkVectorIndex(),
    checkSearchIndexes(),
    checkRedis(),
    checkQueues(),
    checkBillingKey(settings),
    checkPrices(settings, live),
    checkLookupKeys(settings, live),
    checkWebhook(settings, live, appUrl),
    checkStripeEvents(),
    checkSmtp(settings),
    checkTurnstile(settings, isProduction),
    checkAi(settings),
    checkPush(settings),
    checkBackups(settings, now),
    checkSecurityEnv(isProduction),
  ]);

  return {
    status: worstStatus(checks),
    checkedAt: now.toISOString(),
    live,
    checks,
  };
}

function checkAppUrl(appUrl: string, isProduction: boolean): DiagnosticCheck {
  if (!appUrl) {
    return check("app.url", "URL pública", "fail", "APP_URL no está definida", "Configúrala en Coolify (es infraestructura, no PlatformSettings)");
  }
  if (isProduction && !appUrl.startsWith("https://")) {
    return check("app.url", "URL pública", "fail", "APP_URL no usa HTTPS en producción", "Stripe, Meta y Turnstile la necesitan con HTTPS", { url: appUrl });
  }
  if (appUrl.includes("localhost") && isProduction) {
    return check("app.url", "URL pública", "fail", "APP_URL apunta a localhost en producción", "Corrige APP_URL en Coolify", { url: appUrl });
  }
  return check("app.url", "URL pública", "ok", appUrl);
}

async function checkMigrations(): Promise<DiagnosticCheck> {
  try {
    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*)::bigint AS count FROM _prisma_migrations
      WHERE finished_at IS NULL AND rolled_back_at IS NULL
    `;
    const pending = Number(rows[0]?.count ?? 0);
    if (pending > 0) {
      return check("db.migrations", "Migraciones", "fail", `${pending} migración(es) sin aplicar`, "El arranque corre db-migrate.sh; revisa el log del contenedor", { pending });
    }
    return check("db.migrations", "Migraciones", "ok", "Todas aplicadas");
  } catch (error) {
    return check("db.migrations", "Migraciones", "unknown", `No se pudo consultar: ${errorMessage(error)}`);
  }
}

// Búsqueda en mensajes: prisma/sql/ensure-search-indexes.sql no los crea en
// tablas grandes (bloquearía el arranque) — ver desarrollo.md.
async function checkSearchIndexes(): Promise<DiagnosticCheck> {
  try {
    const rows = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes
      WHERE indexname IN ('idx_wa_messages_search_trgm', 'idx_channel_messages_search_trgm')
    `;
    const present = new Set(rows.map((row) => row.indexname));
    const missing = ["idx_wa_messages_search_trgm", "idx_channel_messages_search_trgm"].filter((name) => !present.has(name));
    if (missing.length) {
      return check("db.search", "Índices de búsqueda", "warn", `Falta ${missing.join(", ")}`, "Créalos con CREATE INDEX CONCURRENTLY (runbook en docs/arquitectura/desarrollo.md); la búsqueda en mensajes hará scan completo");
    }
    return check("db.search", "Índices de búsqueda", "ok", "Índices trigram presentes");
  } catch (error) {
    return check("db.search", "Índices de búsqueda", "unknown", errorMessage(error));
  }
}

async function checkVectorIndex(): Promise<DiagnosticCheck> {
  try {
    const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_knowledge_embedding') AS exists
    `;
    if (!rows[0]?.exists) {
      return check("db.vector", "Índice pgvector", "warn", "Falta idx_knowledge_embedding", "Corre prisma/sql/ensure-vector-index.sql; la búsqueda RAG hará scan completo");
    }
    return check("db.vector", "Índice pgvector", "ok", "idx_knowledge_embedding presente");
  } catch (error) {
    return check("db.vector", "Índice pgvector", "unknown", errorMessage(error));
  }
}

async function checkRedis(): Promise<DiagnosticCheck> {
  try {
    const pong = await getRedisClient().ping();
    return pong === "PONG"
      ? check("redis", "Redis", "ok", "Responde")
      : check("redis", "Redis", "warn", `Respuesta inesperada: ${pong}`);
  } catch (error) {
    return check("redis", "Redis", "fail", `Sin conexión: ${errorMessage(error)}`, "Las colas y los límites de la API dependen de Redis");
  }
}

// Todos los repeatables que registra startWorkers() (lib/workers/index.ts).
// Si uno falta, su función deja de correr en silencio: cobros, auto-resolver,
// recordatorios… Mantener esta lista al agregar un tick nuevo.
const EXPECTED_REPEATABLES: Array<{ queue: { getRepeatableJobs: () => Promise<Array<{ name: string }>> }; name: string; label: string }> = [
  { queue: billingTickQueue, name: "tick", label: "cobros" },
  { queue: platformBackupQueue, name: "tick", label: "respaldos" },
  { queue: platformHealthQueue, name: "tick", label: "doctor" },
  { queue: inboxQueue, name: "tick", label: "bandeja (auto-resolver)" },
  { queue: inboxQueue, name: "topic-monitor-tick", label: "monitores de temas" },
  { queue: automationTickQueue, name: "tick", label: "automatizaciones" },
  { queue: campaignScheduleQueue, name: "scheduled-tick", label: "campañas programadas" },
  { queue: sequenceQueue, name: "tick", label: "secuencias" },
  { queue: appointmentReminderQueue, name: "tick", label: "recordatorios de citas" },
  { queue: leadRecoveryQueue, name: "tick", label: "recuperación de leads" },
  { queue: leadScoringQueue, name: "tick", label: "calificación de leads" },
  { queue: leadSheetImportQueue, name: "tick", label: "importación de hojas" },
  { queue: sheetsSyncQueue, name: "tick", label: "sincronización de hojas" },
  { queue: coexistenceTickQueue, name: "tick", label: "coexistencia" },
  { queue: mediaCleanupQueue, name: "purge", label: "limpieza de media" },
];

async function checkQueues(): Promise<DiagnosticCheck> {
  try {
    const queues = [...new Set(EXPECTED_REPEATABLES.map((entry) => entry.queue))];
    const jobs = new Map(await Promise.all(queues.map(async (queue) => [queue, await queue.getRepeatableJobs()] as const)));
    const missing = EXPECTED_REPEATABLES.filter((entry) => !jobs.get(entry.queue)?.some((job) => job.name === entry.name)).map((entry) => entry.label);
    if (missing.length > 0) {
      return check(
        "queues.repeatables",
        "Colas programadas",
        "warn",
        `Faltan ticks: ${missing.join(", ")}`,
        "Reinicia la app para que startWorkers() registre los repeatables",
        { missing }
      );
    }
    return check("queues.repeatables", "Colas programadas", "ok", `${EXPECTED_REPEATABLES.length} tareas programadas activas`);
  } catch (error) {
    return check("queues.repeatables", "Colas programadas", "unknown", `No se pudieron leer: ${errorMessage(error)}`);
  }
}

function checkBillingKey(settings: Awaited<ReturnType<typeof getPlatformSettings>>): DiagnosticCheck {
  const key = settings.stripeSecretKey;
  if (!key) {
    return check("billing.key", "Stripe", "fail", "No hay secret key configurada", "Pégala en /plataforma → Configuración → Stripe");
  }
  const mode = key.startsWith("sk_live_") ? "live" : key.startsWith("sk_test_") ? "test" : "desconocido";
  if (mode === "desconocido") {
    return check("billing.key", "Stripe", "warn", "La key no tiene un prefijo sk_live_/sk_test_ reconocido");
  }
  return check("billing.key", "Stripe", "ok", `Key en modo ${mode}`, undefined, { mode });
}

async function checkPrices(settings: Awaited<ReturnType<typeof getPlatformSettings>>, live: boolean): Promise<DiagnosticCheck> {
  if (!settings.stripeSecretKey) {
    return check("billing.prices", "Precios de Stripe", "fail", "Sin key de Stripe no se pueden verificar", "Configura la key primero");
  }
  if (!live) {
    const configured = PLAN_IDS.every((plan) => Boolean({ ESSENTIAL: settings.stripePriceEssential, BUSINESS: settings.stripePriceBusiness, PRO: settings.stripePricePro }[plan]));
    return check(
      "billing.prices",
      "Precios de Stripe",
      configured ? "unknown" : "warn",
      configured ? "Price ids configurados; usa live=1 para verificar montos" : "Faltan price ids; se resolverán por lookup key",
      "Pulsa “Revisar contra Stripe” para validar montos"
    );
  }

  try {
    const stripe = await getStripe();
    const details: Record<string, unknown> = {};
    let failed = false;
    for (const plan of PLAN_IDS) {
      const priceId = await priceIdFor(plan);
      const price = await stripe.prices.retrieve(priceId);
      const ok = priceMatchesPlan(plan, price);
      if (!ok) failed = true;
      details[plan] = {
        amount: price.unit_amount === null ? null : price.unit_amount / 100,
        currency: price.currency.toUpperCase(),
        interval: price.recurring?.interval ?? null,
        expected: PLANS[plan].pricePerSeatMxn,
        ok,
      };
    }
    return failed
      ? check("billing.prices", "Precios de Stripe", "fail", "Algún precio no coincide con la oferta 59/89/149", "Corrige los price ids o reconcilia el catálogo", details)
      : check("billing.prices", "Precios de Stripe", "ok", "59 / 89 / 149 MXN mensuales", undefined, details);
  } catch (error) {
    return check("billing.prices", "Precios de Stripe", "fail", `No se pudieron leer: ${errorMessage(error)}`, "Revisa la key y los price ids");
  }
}

async function checkLookupKeys(settings: Awaited<ReturnType<typeof getPlatformSettings>>, live: boolean): Promise<DiagnosticCheck> {
  if (!settings.stripeSecretKey || !live) {
    return check("billing.lookup", "Lookup keys", "unknown", live ? "Sin key de Stripe" : "Verificación solo con live=1");
  }
  try {
    const stripe = await getStripe();
    const list = await stripe.prices.list({ lookup_keys: Object.values(PLAN_LOOKUP_KEYS), active: true, limit: 10 });
    const byKey = new Map(list.data.map((price) => [price.lookup_key, price]));
    const details: Record<string, unknown> = {};
    let mismatch = false;
    let missing = 0;
    for (const plan of PLAN_IDS) {
      const lookup = PLAN_LOOKUP_KEYS[plan];
      const found = byKey.get(lookup);
      const expected = await priceIdFor(plan);
      if (!found) missing += 1;
      const ok = found ? found.id === expected || priceMatchesPlan(plan, found) : true;
      if (!ok) mismatch = true;
      details[plan] = { lookup, found: found?.id ?? null, expected, ok };
    }
    if (mismatch) {
      return check("billing.lookup", "Lookup keys", "fail", "Una lookup key apunta a un precio distinto al configurado", "Transfiere la lookup key al precio correcto en Stripe", details);
    }
    if (missing > 0) {
      return check("billing.lookup", "Lookup keys", "warn", `${missing} lookup key(s) sin precio activo`, "Los price ids configurados siguen mandando", details);
    }
    return check("billing.lookup", "Lookup keys", "ok", "Las tres lookup keys apuntan al precio correcto", undefined, details);
  } catch (error) {
    return check("billing.lookup", "Lookup keys", "unknown", errorMessage(error));
  }
}

async function checkWebhook(
  settings: Awaited<ReturnType<typeof getPlatformSettings>>,
  live: boolean,
  appUrl: string
): Promise<DiagnosticCheck> {
  if (!settings.stripeWebhookSecret) {
    return check("billing.webhook", "Webhook de Stripe", "fail", "El webhook secret no está configurado", "Pégalo en /plataforma → Configuración → Stripe");
  }
  if (!live || !settings.stripeSecretKey) {
    return check("billing.webhook", "Webhook de Stripe", "unknown", "Secret presente; usa live=1 para verificar el endpoint en Stripe");
  }
  try {
    const stripe = await getStripe();
    const endpoints = await stripe.webhookEndpoints.list({ limit: 20 });
    const expected = `${appUrl}/api/billing/webhook`;
    const endpoint = endpoints.data.find((item) => item.url === expected);
    if (!endpoint) {
      return check("billing.webhook", "Webhook de Stripe", "fail", "No hay endpoint en Stripe apuntando a esta app", `Crea uno en ${expected}`, { expected });
    }
    if (endpoint.status !== "enabled") {
      return check("billing.webhook", "Webhook de Stripe", "fail", `El endpoint está ${endpoint.status}`, "Reactívalo en Stripe", { url: endpoint.url });
    }
    return check("billing.webhook", "Webhook de Stripe", "ok", "Endpoint activo", undefined, { url: endpoint.url, events: endpoint.enabled_events.length });
  } catch (error) {
    return check("billing.webhook", "Webhook de Stripe", "unknown", `No se pudo verificar: ${errorMessage(error)}`);
  }
}

async function checkStripeEvents(): Promise<DiagnosticCheck> {
  try {
    const last = await prisma.stripeEvent.findFirst({ orderBy: { processedAt: "desc" }, select: { type: true, processedAt: true } });
    if (!last) {
      return check("billing.events", "Eventos de Stripe", "warn", "No se ha procesado ningún evento", "Si acabas de configurar Stripe, espera al primer cobro o reenvía un evento");
    }
    const ageHours = Math.round((Date.now() - last.processedAt.getTime()) / (60 * 60 * 1000));
    return check("billing.events", "Eventos de Stripe", "ok", `Último: ${last.type} (hace ${ageHours} h)`, undefined, { type: last.type, ageHours });
  } catch (error) {
    return check("billing.events", "Eventos de Stripe", "unknown", errorMessage(error));
  }
}

function checkSmtp(settings: Awaited<ReturnType<typeof getPlatformSettings>>): DiagnosticCheck {
  const missing: string[] = [];
  if (!settings.smtpHost) missing.push("host");
  if (!settings.emailFrom) missing.push("remitente");
  if (!settings.smtpUser) missing.push("usuario");
  if (!settings.smtpPass) missing.push("contraseña");
  if (missing.length > 0) {
    const devHost = process.env.NODE_ENV !== "production" ? process.env.SMTP_HOST?.trim() : null;
    if (devHost) {
      return check("email.smtp", "Correo (SMTP)", "warn", `Usando el SMTP de desarrollo (${devHost})`, "Producción necesita host, usuario y contraseña en /plataforma");
    }
    return check("email.smtp", "Correo (SMTP)", "fail", `Faltan: ${missing.join(", ")}`, "Sin SMTP no salen verificación de correo ni invitaciones");
  }
  return check("email.smtp", "Correo (SMTP)", "ok", `${settings.smtpHost}:${settings.smtpPort}`, undefined, { secure: settings.smtpSecure, from: settings.emailFrom });
}

function checkTurnstile(settings: Awaited<ReturnType<typeof getPlatformSettings>>, isProduction: boolean): DiagnosticCheck {
  if (!settings.turnstileSiteKey || !settings.turnstileSecretKey) {
    return check("turnstile", "Turnstile", "warn", "Captcha sin configurar", "El registro funciona sin captcha; agrega site key y secret para protegerlo");
  }
  const testKeys = settings.turnstileSiteKey.startsWith("1x000000") || settings.turnstileSecretKey.startsWith("1x000000") || settings.turnstileSecretKey.startsWith("2x000000");
  if (testKeys && isProduction) {
    return check("turnstile", "Turnstile", "warn", "Se están usando las claves de prueba de Cloudflare en producción", "Cámbialas por las reales");
  }
  return check("turnstile", "Turnstile", "ok", "Site key y secret configurados");
}

function checkAi(settings: Awaited<ReturnType<typeof getPlatformSettings>>): DiagnosticCheck {
  if (!settings.opencodeApiKey && !settings.googleApiKey) {
    return check("ai.providers", "Inteligencia artificial", "fail", "No hay ninguna key de IA", "Configura OpenCode Go o Google en /plataforma");
  }
  if (!settings.googleApiKey) {
    return check("ai.providers", "Inteligencia artificial", "warn", "Falta la key de Google: sin embeddings no hay RAG ni transcripción de audios", "Los bots pueden responder, pero la búsqueda de conocimiento y la transcripción de notas de voz no funcionan");
  }
  return check("ai.providers", "Inteligencia artificial", "ok", "Proveedores configurados");
}

function checkPush(settings: Awaited<ReturnType<typeof getPlatformSettings>>): DiagnosticCheck {
  if (!settings.vapidPublicKey || !settings.vapidPrivateKey) {
    return check("push", "Notificaciones push", "warn", "Faltan las llaves VAPID", "Genéralas en /plataforma → Configuración; sin ellas el navegador no recibe avisos de chats");
  }
  return check("push", "Notificaciones push", "ok", "Llaves VAPID configuradas");
}

async function checkBackups(settings: Awaited<ReturnType<typeof getPlatformSettings>>, now: Date): Promise<DiagnosticCheck> {
  if (!settings.backupEnabled) {
    return check("backups", "Respaldos", "warn", "Respaldos desactivados", "Actívalos en /plataforma → Respaldos");
  }
  try {
    const last = await prisma.platformBackupRun.findFirst({
      where: { status: "SUCCESS" },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true },
    });
    const freshness = backupFreshness({ enabled: true, lastSuccessAt: last?.startedAt ?? null, now });
    if (freshness === "ok") {
      return check("backups", "Respaldos", "ok", "Último respaldo dentro de 36 h", undefined, { lastSuccessAt: last?.startedAt?.toISOString() ?? null });
    }
    if (freshness === "never") {
      return check("backups", "Respaldos", "fail", "Nunca ha terminado un respaldo", "Corre uno manual desde /plataforma → Respaldos");
    }
    return check("backups", "Respaldos", "fail", "El último respaldo tiene más de 36 h", "Revisa la configuración del bucket y corre uno manual");
  } catch (error) {
    return check("backups", "Respaldos", "unknown", errorMessage(error));
  }
}

async function checkSecurityEnv(isProduction: boolean): Promise<DiagnosticCheck> {
  const encryption = process.env.ENCRYPTION_KEY ?? "";
  const auth = process.env.AUTH_SECRET ?? "";
  const admins = process.env.PLATFORM_ADMIN_EMAILS ?? "";
  const problems: string[] = [];
  if (!/^[0-9a-f]{64}$/i.test(encryption)) problems.push("ENCRYPTION_KEY inválida");
  if (!auth) problems.push("AUTH_SECRET ausente");
  if (!admins.trim()) problems.push("PLATFORM_ADMIN_EMAILS vacío");

  let seeded = 0;
  try {
    seeded = await prisma.user.count({ where: { email: { endsWith: "@sundaycrm.test" } } });
  } catch {
    // Sin BD no se puede comprobar; no cambia el resultado de env.
  }
  if (isProduction && seeded > 0) problems.push(`${seeded} usuario(s) de seed`);

  if (problems.length > 0) {
    return check("security.env", "Seguridad", "fail", problems.join(" · "), "Revisa las variables de infraestructura en Coolify", { seeded });
  }
  return check("security.env", "Seguridad", "ok", "Variables de infraestructura presentes", undefined, { seeded });
}
