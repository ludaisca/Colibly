import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { forbidRoles } from "@/lib/roles";
import { requireOrgId } from "@/lib/tenancy";
import { rateLimit } from "@/lib/rate-limit";
import { publicErrorMessage } from "@/lib/api-errors";
import { getLiveSnapshot } from "@/lib/estadisticas/live";

// Panel en vivo de /estadisticas/reportes. Mismo bloqueo que la página:
// ejecutivo no ve estadísticas (proxy.ts no aplica roles a /api).
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const forbidden = forbidRoles(session, ["ejecutivo"]);
    if (forbidden) return forbidden;
    if (!(await rateLimit(`live-stats:${session.user.id}`, 30, 60)).allowed) {
      return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
    }
    const snapshot = await getLiveSnapshot(session.user.id, await requireOrgId(session.user.id));
    return NextResponse.json(snapshot, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno") }, { status: 500 });
  }
}
