import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireOrgId } from "@/lib/tenancy";
import { teamOptions, userTeamIds } from "@/lib/teams/teams";

// Equipos de la organización para los selectores de la bandeja (cualquier
// rol: mover un chat de equipo es parte de atenderlo). `mine`: los míos.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const [teams, mine] = await Promise.all([teamOptions(await requireOrgId(session.user.id)), userTeamIds(session.user.id)]);
  return NextResponse.json({ teams, mine }, { headers: { "Cache-Control": "private, max-age=30" } });
}
