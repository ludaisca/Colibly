import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getOnboardingSteps } from "@/lib/onboarding";

// Primeros pasos pendientes para los estados vacíos (F9). Mismo cálculo que
// el checklist del panel. Solo admin: los demás roles no pueden hacer esos
// pasos, así que reciben una lista vacía (la UI les muestra otro texto).
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ steps: [] });
  const steps = await getOnboardingSteps(session.user.id);
  return NextResponse.json({ steps: steps.filter((step) => !step.done) });
}
