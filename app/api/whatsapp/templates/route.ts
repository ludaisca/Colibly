import { after, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserAccountIds } from "@/lib/shared-accounts";
import { forbidRoles } from "@/lib/roles";
import { publicErrorMessage } from "@/lib/api-errors";
import { refreshPendingTemplates, syncAccountTemplates, TemplateSyncError } from "@/lib/whatsapp/template-sync";

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const waAccountId = searchParams.get("waAccountId");

    if (!waAccountId) {
      return NextResponse.json(
        { error: "waAccountId es requerido" },
        { status: 400 }
      );
    }

    const accountIds = await getUserAccountIds(session.user.id);

    if (!accountIds.includes(waAccountId)) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    }

    const templates = await prisma.wATemplate.findMany({
      where: { waAccountId },
      orderBy: { name: "asc" },
    });

    // Si hay plantillas en revisión, pregunta a Meta en segundo plano (como
    // mucho una vez por minuto): el webhook las actualiza al instante, esto es
    // la red de seguridad si no llegó.
    if (templates.some((t) => t.status === "PENDING" || t.status === "IN_APPEAL")) {
      after(() => refreshPendingTemplates([waAccountId]));
    }

    return NextResponse.json(templates);
  } catch (error) {
    const message =
      publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const denied = forbidRoles(session, ["ejecutivo"]);
    if (denied) return denied;

    const { waAccountId } = (await req.json().catch(() => ({}))) as { waAccountId: string };

    const accountIds = await getUserAccountIds(session.user.id);

    if (!accountIds.includes(waAccountId)) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    }

    const account = await prisma.wAAccount.findFirst({
      where: { id: waAccountId },
    });

    if (!account) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    }

    try {
      return NextResponse.json(await syncAccountTemplates(account));
    } catch (err) {
      if (err instanceof TemplateSyncError) {
        return NextResponse.json(
          { error: err.code === "not_configured" ? "Sincronizar plantillas solo aplica a cuentas de Meta Cloud API con WABA ID configurado" : err.message },
          { status: err.code === "not_configured" ? 400 : 502 }
        );
      }
      throw err;
    }
  } catch (error) {
    const message =
      publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
