import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; ruleId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id, ruleId } = await params;
    // El filtro por waAccount.userId (no solo por ruleId) evita que alguien
    // borre una regla de una cuenta que no es suya adivinando el id.
    const result = await prisma.wAAccountRoutingRule.deleteMany({
      where: { id: ruleId, waAccountId: id, waAccount: { userId: session.user.id } },
    });
    if (result.count === 0) {
      return NextResponse.json({ error: "Regla no encontrada" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno del servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
