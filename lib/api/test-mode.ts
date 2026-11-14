import { ApiError } from "./respond";

// Keys de prueba (sk_test_): leen lo mismo que una key real, con sus permisos
// y cuentas, pero no cambian nada. POST /messages valida todo (destino,
// plantilla y sus parámetros) y responde lo que habría enviado sin mandarlo ni
// guardarlo; POST /webhooks/{id}/test sí entrega (va a tu propio endpoint).
// Cualquier otra escritura responde 403.

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const TEST_WRITES: RegExp[] = [/^\/api\/v1\/messages\/?$/, /^\/api\/v1\/webhooks\/[^/]+\/test\/?$/];

export function isTestKeyWriteAllowed(method: string, pathname: string): boolean {
  if (SAFE_METHODS.has(method)) return true;
  return method === "POST" && TEST_WRITES.some((r) => r.test(pathname));
}

export function assertTestKeyAllowed(req: Request): void {
  if (isTestKeyWriteAllowed(req.method, new URL(req.url).pathname)) return;
  throw new ApiError(403, "forbidden", "Las keys de prueba (sk_test_) solo consultan y simulan POST /messages: usa una key sk_live_ para cambiar datos");
}
