import { NextResponse } from "next/server";
import { buildOpenApiSpec } from "@/lib/api/openapi";
import { withSchemaVersion } from "@/lib/api/respond";

// El documento no cambia mientras corre el proceso: se arma una vez por URL
// base (antes se reconstruía en cada petición, ~190 ms de servidor).
const specCache = new Map<string, ReturnType<typeof buildOpenApiSpec>>();

// Pública (sin API key): describe la API, no expone datos.
export function GET(req: Request) {
  const base = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL)?.replace(/\/$/, "") || new URL(req.url).origin;
  let spec = specCache.get(base);
  if (!spec) {
    spec = buildOpenApiSpec(`${base}/api/v1`);
    if (specCache.size < 4) specCache.set(base, spec);
  }
  return withSchemaVersion(
    NextResponse.json(spec, {
      headers: { "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" },
    })
  );
}
