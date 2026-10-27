import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { forbidRoles } from "@/lib/roles";
import { requireOrgId } from "@/lib/tenancy";

export async function pipelineSession(): Promise<{ organizationId: string; userId: string } | NextResponse> {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const denied = forbidRoles(session, ["ejecutivo"]);
  if (denied) return denied;
  return { organizationId: await requireOrgId(session.user.id), userId: session.user.id };
}
