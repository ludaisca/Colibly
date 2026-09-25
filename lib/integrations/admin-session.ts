import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// Las integraciones (API keys, webhooks) son solo de admin — mismo criterio
// que Meta Ads y la configuración de IA. Devuelve el id del admin o la
// respuesta 401/403 lista para devolver.
export async function requireAdmin(): Promise<{ userId: string } | NextResponse> {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  return { userId: session.user.id };
}
