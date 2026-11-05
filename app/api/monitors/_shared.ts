import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { forbidRoles } from "@/lib/roles";
import { requireOrgId } from "@/lib/tenancy";
import { MONITOR_DESCRIPTION_MAX } from "@/lib/monitors/rules";

// Monitores de temas (F2): solo admin, como Bots IA (nav oculto → proxy.ts
// USER_BLOCKED/EXECUTIVE_BLOCKED → 403 aquí).
export async function monitorSession(): Promise<{ organizationId: string; userId: string } | NextResponse> {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const denied = forbidRoles(session, ["user", "ejecutivo"]);
  if (denied) return denied;
  return { organizationId: await requireOrgId(session.user.id), userId: session.user.id };
}

export const monitorSchema = z.object({
  name: z.string().trim().min(1, "Ponle un nombre").max(80, "Máximo 80 caracteres"),
  description: z.string().trim().min(10, "Describe el tema con al menos 10 caracteres").max(MONITOR_DESCRIPTION_MAX, `Máximo ${MONITOR_DESCRIPTION_MAX} caracteres`),
  active: z.boolean().optional(),
});

export const PLAN_MESSAGE = "Los monitores de temas están en el plan Pro.";
