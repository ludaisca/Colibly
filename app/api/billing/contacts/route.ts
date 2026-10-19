import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireOrgId } from "@/lib/tenancy";
import { getContactUsage } from "@/lib/billing/contact-limits";
import { publicErrorMessage } from "@/lib/api-errors";

// Contactos usados vs. límite del plan (contador de Contactos y avisos).
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    return NextResponse.json(await getContactUsage(await requireOrgId(session.user.id)));
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}
