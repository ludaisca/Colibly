import { apiError, withSchemaVersion } from "@/lib/api/respond";

// Cualquier ruta inexistente bajo /api/v1 responde el JSON de error de la API
// ({ error: { code, message } }), no la página 404 de la app: un integrador
// que se equivoca de URL debe poder leer el error igual que los demás.
// Las rutas reales siempre ganan a este catch-all.
function notFound(req: Request): Response {
  const path = new URL(req.url).pathname;
  return withSchemaVersion(apiError(404, "not_found", `No existe ${req.method} ${path}. Consulta /api/v1/openapi.json`));
}

export const GET = notFound;
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
