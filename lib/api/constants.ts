// Números de la API pública y los webhooks que se documentan (OpenAPI y
// /docs/api) Y se aplican en el código: una sola fuente para que la
// documentación no se desfase. Sin imports: lo usan páginas públicas.

/** Solicitudes por minuto por API key (ventana deslizante de 60 s). */
export const API_REQUESTS_PER_MINUTE = 120;
/** Intentos con una API key inválida por minuto y por IP. */
export const API_BAD_KEY_ATTEMPTS_PER_MINUTE = 30;
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
/** Días que se guarda el registro de entregas. */
export const WEBHOOK_DELIVERY_RETENTION_DAYS = 30;

/** Topes por organización (las cuentas internas no tienen tope). */
export const MAX_ACTIVE_API_KEYS = 10;
export const MAX_WEBHOOKS = 10;
