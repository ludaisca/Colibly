// Números de la API pública y los webhooks que se documentan (OpenAPI y
// /docs/api) Y se aplican en el código: una sola fuente para que la
// documentación no se desfase. Sin imports: lo usan páginas públicas.

// Los límites de velocidad se pueden ajustar por env var (entero > 0; vacío o
// inválido = valor por defecto). Ojo: /docs/api es una página estática, así que
// para que la documentación refleje un valor distinto la env var debe existir
// también al construir la imagen.
function envInt(name: string, fallback: number): number {
  const raw = typeof process !== "undefined" ? process.env?.[name] : undefined;
  const n = raw ? Number(raw) : NaN;
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/** Solicitudes por minuto por API key (ventana deslizante de 60 s). */
export const API_REQUESTS_PER_MINUTE = envInt("API_RATE_LIMIT_PER_KEY", 120);
/** Solicitudes por minuto por organización, sumando todas sus keys. */
export const API_ORG_REQUESTS_PER_MINUTE = envInt("API_RATE_LIMIT_PER_ORG", 600);
/** Red de seguridad: solicitudes por minuto por IP a /api/v1, con o sin key. */
export const API_IP_REQUESTS_PER_MINUTE = envInt("API_RATE_LIMIT_PER_IP", 3000);
/** POST /messages: envíos por minuto por organización. */
export const API_SEND_PER_MINUTE_PER_ORG = envInt("API_RATE_LIMIT_SEND_PER_ORG", 60);
/** GET /conversations (el listado más caro): solicitudes por minuto por key. */
export const API_CONVERSATIONS_LIST_PER_MINUTE = envInt("API_RATE_LIMIT_CONVERSATIONS_PER_KEY", 60);
/** POST /webhooks/{id}/deliveries/{deliveryId}/replay: reenvíos por minuto por organización. */
export const API_WEBHOOK_REPLAYS_PER_MINUTE = envInt("API_RATE_LIMIT_WEBHOOK_REPLAYS_PER_ORG", 30);
// Eventos webhook.test por minuto por organización (POST /webhooks/{id}/test).
export const API_WEBHOOK_TESTS_PER_MINUTE = 10;
/** POST /messages: envíos por día (UTC) por organización. */
export const API_DAILY_SENDS_PER_ORG = envInt("API_DAILY_SEND_CAP_PER_ORG", 10_000);
/** Tamaño máximo del cuerpo de una solicitud a /api/v1. */
export const API_MAX_BODY_BYTES = envInt("API_MAX_BODY_BYTES", 1024 * 1024);
/** Segundos que se guarda en caché (Redis) la key, el acceso del plan y el alcance. */
export const API_AUTH_CACHE_SECONDS = envInt("API_AUTH_CACHE_SECONDS", 60);
/** Retry-After cuando el limitador no está disponible (503). */
export const API_UNAVAILABLE_RETRY_SECONDS = 5;
/** Intentos con una API key inválida por minuto y por IP. */
export const API_BAD_KEY_ATTEMPTS_PER_MINUTE = 30;
/**
 * Versión del contrato de datos (forma de mensajes, eventos y recursos). Va en
 * `X-Colibly-Schema-Version` de cada respuesta de /api/v1 y de cada entrega de
 * webhook. Cambia solo con un cambio documentado en el changelog del OpenAPI;
 * los cambios son aditivos (campos nuevos), nunca se quita ni renombra uno.
 */
// Fecha del contrato; un segundo cambio el mismo día lleva sufijo (.2).
export const API_SCHEMA_VERSION = "2026-11-05.2";
export const API_SCHEMA_VERSION_HEADER = "X-Colibly-Schema-Version";
/** Página de listados. */
export const API_PAGE_DEFAULT = 25;
export const API_PAGE_MAX = 100;
/** Idempotency-Key: horas que se recuerda la respuesta. */
export const IDEMPOTENCY_TTL_HOURS = 24;

/** Intentos totales por entrega de webhook (1 + 5 reintentos). */
export const WEBHOOK_DELIVERY_ATTEMPTS = 6;
/** Espera antes del primer reintento; se duplica en cada uno. */
export const WEBHOOK_BACKOFF_BASE_MS = 30_000;
/** Tiempo máximo para que el receptor responda. */
export const WEBHOOK_TIMEOUT_SECONDS = 20;
/** Entregas fallidas seguidas (cada una con sus reintentos) antes de desactivarse solo. */
export const WEBHOOK_MAX_CONSECUTIVE_FAILURES = 20;
/** Entregas de webhook en paralelo (todo el worker). */
export const WEBHOOK_WORKER_CONCURRENCY = envInt("WEBHOOK_WORKER_CONCURRENCY", 20);
/** Entregas en paralelo a un mismo endpoint: un receptor lento no acapara el worker. */
export const WEBHOOK_PER_ENDPOINT_CONCURRENCY = envInt("WEBHOOK_PER_ENDPOINT_CONCURRENCY", 2);
/** Días que se guarda el registro de entregas. */
export const WEBHOOK_DELIVERY_RETENTION_DAYS = 30;

/** Topes por organización (las cuentas internas no tienen tope). */
export const MAX_ACTIVE_API_KEYS = 10;
export const MAX_WEBHOOKS = 10;
