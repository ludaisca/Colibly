import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireOrgId } from "@/lib/tenancy";
import { forbidRoles } from "@/lib/roles";
import { publicErrorMessage } from "@/lib/api-errors";
import { rateLimit } from "@/lib/rate-limit";
import { deleteSampleData, sampleDataStatus, seedSampleData } from "@/lib/sample-data/spa-aurora";
import { invalidateOrgBilling } from "@/lib/billing/gates";

// Datos de ejemplo (Spa Aurora). Solo admin y siempre de SU organización.
async function admin() {
  const session = await auth();
  if (!session?.user?.id) return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  const denied = forbidRoles(session, ["user", "ejecutivo"]);
  if (denied) return { error: denied };
  return { userId: session.user.id, organizationId: await requireOrgId(session.user.id) };
}

export async function GET() {
  try {
    const a = await admin();
    if ("error" in a) return a.error;
    return NextResponse.json(await sampleDataStatus(a.organizationId));
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}

export async function POST() {
  try {
    const a = await admin();
    if ("error" in a) return a.error;
    const { allowed } = await rateLimit(`sample-data:${a.organizationId}`, 10, 60 * 60);
    if (!allowed) return NextResponse.json({ error: "Demasiados intentos, espera un momento" }, { status: 429 });
    const result = await seedSampleData(a.organizationId, a.userId);
    invalidateOrgBilling(a.organizationId);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const a = await admin();
    if ("error" in a) return a.error;
    const result = await deleteSampleData(a.organizationId);
    invalidateOrgBilling(a.organizationId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}
