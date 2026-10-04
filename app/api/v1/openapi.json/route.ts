import { NextResponse } from "next/server";
import { buildOpenApiSpec } from "@/lib/api/openapi";

// Pública (sin API key): describe la API, no expone datos.
export function GET(req: Request) {
  const base = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL)?.replace(/\/$/, "") || new URL(req.url).origin;
  return NextResponse.json(buildOpenApiSpec(`${base}/api/v1`), {
    headers: { "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" },
  });
}
