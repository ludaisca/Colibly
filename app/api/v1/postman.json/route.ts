import { NextResponse } from "next/server";
import { buildOpenApiSpec } from "@/lib/api/openapi";
import { buildPostmanCollection } from "@/lib/api/postman";
import { methodNotAllowed, withSchemaVersion } from "@/lib/api/respond";

const cache = new Map<string, ReturnType<typeof buildPostmanCollection>>();

// Pública (sin API key): la colección de Postman de la API, armada desde
// openapi.json. Se importa en Postman con «Import → Link».
export function GET(req: Request) {
  const base = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL)?.replace(/\/$/, "") || new URL(req.url).origin;
  let collection = cache.get(base);
  if (!collection) {
    collection = buildPostmanCollection(buildOpenApiSpec(`${base}/api/v1`) as unknown as Parameters<typeof buildPostmanCollection>[0]);
    if (cache.size < 4) cache.set(base, collection);
  }
  return withSchemaVersion(
    NextResponse.json(collection, {
      headers: {
        "Cache-Control": "public, max-age=300",
        "Access-Control-Allow-Origin": "*",
        "Content-Disposition": 'inline; filename="colibly-api.postman_collection.json"',
      },
    })
  );
}

export const POST = methodNotAllowed("GET");
export const PUT = POST;
export const PATCH = POST;
export const DELETE = POST;
