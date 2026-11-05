import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireOrgId } from "@/lib/tenancy";
import { forbidRoles } from "@/lib/roles";
import { publicErrorMessage } from "@/lib/api-errors";
import { deleteTeam, TeamError, teamBodySchema, updateTeam } from "@/lib/teams/teams";

type Params = { params: Promise<{ id: string }> };

async function guard() {
  const session = await auth();
  if (!session?.user?.id) return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  const forbidden = forbidRoles(session, ["user", "ejecutivo"]);
  if (forbidden) return { error: forbidden };
  return { organizationId: await requireOrgId(session.user.id) };
}

function fail(error: unknown) {
  if (error instanceof TeamError) return NextResponse.json({ error: error.message }, { status: error.status });
  return NextResponse.json({ error: publicErrorMessage(error, "Error interno") }, { status: 500 });
}

export async function PATCH(req: Request, { params }: Params) {
  const ctx = await guard();
  if ("error" in ctx) return ctx.error;
  const parsed = teamBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  try {
    await updateTeam(ctx.organizationId, (await params).id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const ctx = await guard();
  if ("error" in ctx) return ctx.error;
  try {
    await deleteTeam(ctx.organizationId, (await params).id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
