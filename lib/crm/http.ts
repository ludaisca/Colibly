import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { CrmError } from "@/lib/crm/errors";
import { getActor, type CrmActor } from "@/lib/crm/access";
import { publicErrorMessage } from "@/lib/api-errors";

// Envoltorio de las rutas /api/crm/*: autentica, resuelve el actor y traduce
// los errores de negocio a respuestas JSON `{ error, code, ...extra }`.
export function crmRoute<P = Record<string, never>>(
  fn: (args: { req: Request; actor: CrmActor; params: P }) => Promise<NextResponse | Response | unknown>
) {
  return async (req: Request, ctx: { params: Promise<P> } = { params: Promise.resolve({} as P) }): Promise<Response> => {
    try {
      const actor = await getActor();
      const params = await ctx.params;
      const result = await fn({ req, actor, params });
      return result instanceof Response ? result : NextResponse.json(result);
    } catch (err) {
      if (err instanceof CrmError) {
        return NextResponse.json({ error: err.message, code: err.code, ...(err.extra ?? {}) }, { status: err.status });
      }
      if (err instanceof ZodError) {
        return NextResponse.json({ error: err.issues[0]?.message ?? "Datos inválidos", code: "invalid_request" }, { status: 400 });
      }
      console.error("[crm] error:", err);
      return NextResponse.json({ error: publicErrorMessage(err, "Error interno del servidor") }, { status: 500 });
    }
  };
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new CrmError(400, "invalid_request", "El cuerpo debe ser JSON válido");
  }
}
