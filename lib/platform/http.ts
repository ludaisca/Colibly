import { NextResponse } from "next/server";
import type { PlatformTokenContext } from "./scopes";
import type { OpsResult, PlatformActor } from "./ops";

// Respuestas uniformes de /api/plataforma/v1.
export function opsResponse<T>(result: OpsResult<T>): NextResponse {
  if (result.ok) return NextResponse.json({ ok: true, data: result.data }, { headers: { "Cache-Control": "no-store" } });
  return NextResponse.json(
    { error: { code: result.code, message: result.message } },
    { status: result.status, headers: { "Cache-Control": "no-store" } }
  );
}

export function tokenActor(ctx: PlatformTokenContext): PlatformActor {
  return { type: "token", email: ctx.actorEmail, tokenId: ctx.tokenId, environment: ctx.environment };
}
