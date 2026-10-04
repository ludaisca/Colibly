import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { forbidRoles } from "@/lib/roles";
import { requireOrgId } from "@/lib/tenancy";
import { getMetaPlatformApp } from "@/lib/meta/platform-app";
import { GRAPH_API_VERSION } from "@/lib/meta/graph";

// Datos PÚBLICOS que el navegador necesita para abrir el diálogo de Embedded
// Signup (App ID, ID de configuración, versión de Graph). Nunca incluye el App
// Secret ni el token de verificación.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const denied = forbidRoles(session, ["ejecutivo"]);
  if (denied) return denied;

  const app = await getMetaPlatformApp();
  const org = await prisma.organization.findUnique({
    where: { id: await requireOrgId(session.user.id) },
    select: { whatsappCoexistenceEnabled: true },
  });
  const available = !!(app.appId && app.appSecret && app.embeddedSignupConfigId);
  return NextResponse.json({
    available,
    appId: available ? app.appId : null,
    configId: available ? app.embeddedSignupConfigId : null,
    graphVersion: GRAPH_API_VERSION,
    coexistenceAllowed: !!org?.whatsappCoexistenceEnabled,
  });
}
