import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireOrgId } from "@/lib/tenancy";
import { evaluatePlanLimit } from "@/lib/billing/gates";
import { publicErrorMessage } from "@/lib/api-errors";

const KEYS = ["whatsapp", "telegram", "messenger", "instagram"] as const;
type Key = (typeof KEYS)[number];

// Pre-chequeo de solo lectura para la UI: ¿cabe una conexión más de este
// canal? Mismo cálculo que el candado del servidor (evaluatePlanLimit), para
// no mandar a alguien al flujo de Meta y rechazarlo al final.
export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const key = new URL(req.url).searchParams.get("key");
    if (!key || !(KEYS as readonly string[]).includes(key)) return NextResponse.json({ error: "key inválida" }, { status: 400 });
    const exceeded = await evaluatePlanLimit(await requireOrgId(session.user.id), key as Key);
    return NextResponse.json(exceeded ? { allowed: false, ...exceeded } : { allowed: true });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}
