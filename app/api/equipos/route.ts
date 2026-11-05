import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireOrgId } from "@/lib/tenancy";
import { forbidRoles } from "@/lib/roles";
import { publicErrorMessage } from "@/lib/api-errors";
import { createTeam, listTeams, TeamError, teamBodySchema, teamFormOptions } from "@/lib/teams/teams";

// Equipos (Usuarios → Equipos). Solo admin: es configuración de la
// organización. Los selectores de la bandeja usan /api/equipos/opciones.


export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const forbidden = forbidRoles(session, ["user", "ejecutivo"]);
  if (forbidden) return forbidden;
  try {
    const organizationId = await requireOrgId(session.user.id);
    const [teams, options] = await Promise.all([listTeams(organizationId), teamFormOptions(organizationId)]);
    return NextResponse.json({ teams, ...options });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno") }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const forbidden = forbidRoles(session, ["user", "ejecutivo"]);
  if (forbidden) return forbidden;
  const parsed = teamBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  try {
    const id = await createTeam(await requireOrgId(session.user.id), parsed.data);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    if (error instanceof TeamError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno") }, { status: 500 });
  }
}
