import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { forbidRoles } from "@/lib/roles";
import { GRAPH_API_VERSION } from "@/lib/meta/graph";
import { messagingConnectConfig } from "@/lib/meta-messaging/platform-connect";

// Datos PÚBLICOS para abrir el diálogo "Conectar con Facebook" de Messenger e
// Instagram (App ID, ID de configuración, versión de Graph). Nunca el secreto.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const denied = forbidRoles(session, ["ejecutivo"]);
  if (denied) return denied;
  return NextResponse.json({ ...(await messagingConnectConfig()), graphVersion: GRAPH_API_VERSION });
}
