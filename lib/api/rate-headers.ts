// Headers de límite de velocidad de la API pública. authenticateApiKey anota
// el estado del límite en el Request; withApiErrors los escribe en la
// respuesta (sea éxito o error), así ningún handler tiene que acordarse.
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  /** Epoch en ms en que se libera un lugar en la ventana. */
  resetAt: number;
  /** Qué límite se informa: el más ajustado, o el que rechazó (en el 429). */
  scope?: RateLimitScope;
}

export type RateLimitScope = "key" | "organization" | "ip" | "endpoint" | "daily";

const infoByRequest = new WeakMap<Request, RateLimitInfo>();

export function setRateLimitInfo(req: Request, info: RateLimitInfo): void {
  infoByRequest.set(req, info);
}

export function applyRateLimitHeaders(req: Request, res: Response): Response {
  const info = infoByRequest.get(req);
  if (!info) return res;
  const resetSeconds = Math.max(1, Math.ceil((info.resetAt - Date.now()) / 1000));
  res.headers.set("X-RateLimit-Limit", String(info.limit));
  res.headers.set("X-RateLimit-Remaining", String(Math.max(0, info.remaining)));
  // Segundos hasta que se libera un lugar (no epoch): no depende del reloj del cliente.
  res.headers.set("X-RateLimit-Reset", String(resetSeconds));
  if (info.scope) res.headers.set("X-RateLimit-Scope", info.scope);
  if (res.status === 429) res.headers.set("Retry-After", String(resetSeconds));
  return res;
}

// Varios límites se aplican a la misma solicitud (key, organización, endpoint):
// los headers informan el más ajustado (menos restantes), que es el que
// rechazará primero.
export function mergeRateLimitInfo(req: Request, info: RateLimitInfo): void {
  const current = infoByRequest.get(req);
  if (!current || info.remaining < current.remaining || (info.remaining === current.remaining && info.limit < current.limit)) {
    infoByRequest.set(req, info);
  }
}

/** Pasa el estado del límite de una solicitud a otra (el MCP autentica sobre una copia GET). */
export function copyRateLimitInfo(from: Request, to: Request): void {
  const info = infoByRequest.get(from);
  if (info) infoByRequest.set(to, info);
}
