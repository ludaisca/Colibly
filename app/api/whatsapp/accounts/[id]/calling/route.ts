import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { accountManageWhere } from "@/lib/tenancy";
import { callingErrorResponse } from "@/lib/whatsapp/calling/access";
import { setCallingEnabled } from "@/lib/whatsapp/calling/meta";

// Enciende el botón de llamada en un número solo de Cloud API. Coexistencia
// se queda en el celular: Meta no entrega esas llamadas por la API.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { allowed } = await rateLimit(`wa-calling-settings:${session.user.id}`, 10, 60);
    if (!allowed) return NextResponse.json({ error: "Demasiados intentos" }, { status: 429 });

    const { id } = await params;
    const body = await req.json().catch(() => null) as { enabled?: unknown } | null;
    if (!body || typeof body.enabled !== "boolean") {
      return NextResponse.json({ error: "Indica si las llamadas quedan activas" }, { status: 400 });
    }

    const account = await prisma.wAAccount.findFirst({ where: { id, ...(await accountManageWhere(session.user.id)) } });
    if (!account) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });

    await setCallingEnabled(account, body.enabled);
    await prisma.wAAccount.update({ where: { id: account.id }, data: { callingEnabled: body.enabled } });
    return NextResponse.json({ callingEnabled: body.enabled });
  } catch (error) {
    return callingErrorResponse(error, "No se pudo cambiar las llamadas de este número");
  }
}
