// Headers de límite de velocidad de la API pública. authenticateApiKey anota
// el estado del límite en el Request; withApiErrors los escribe en la
// respuesta (sea éxito o error), así ningún handler tiene que acordarse.
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  /** Epoch en ms en que se libera un lugar en la ventana. */
  resetAt: number;
}

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
  if (res.status === 429) res.headers.set("Retry-After", String(resetSeconds));
  return res;
}
