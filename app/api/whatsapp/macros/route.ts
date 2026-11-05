import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireOrgId } from "@/lib/tenancy";
import { forbidRoles } from "@/lib/roles";
import { macroInputSchema } from "@/lib/macros/types";
import { publicErrorMessage } from "@/lib/api-errors";
import { checkUserFeature } from "@/lib/billing/entitlements";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const organizationId = await requireOrgId(session.user.id);
    const macros = await prisma.macro.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, description: true, actions: true, createdAt: true, updatedAt: true },
    });
    return NextResponse.json(macros);
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const denied = forbidRoles(session, ["ejecutivo"]);
    if (denied) return denied;
    const notInLicense = await checkUserFeature(session.user.id, "macros");
    if (notInLicense) return notInLicense;

    const parsed = macroInputSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

    const organizationId = await requireOrgId(session.user.id);
    const macro = await prisma.macro.create({
      data: {
        organizationId,
        name: parsed.data.name,
        description: parsed.data.description || null,
        actions: parsed.data.actions,
        createdById: session.user.id,
      },
      select: { id: true, name: true, description: true, actions: true, createdAt: true, updatedAt: true },
    });
    return NextResponse.json(macro, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}
