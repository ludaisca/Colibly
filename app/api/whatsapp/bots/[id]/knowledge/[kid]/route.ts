import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unlinkKnowledgeFromBot } from "@/lib/ai/rag";
import { publicErrorMessage } from "@/lib/api-errors";
import { orgWhere } from "@/lib/tenancy";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; kid: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (session.user.role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { id, kid } = await params;

    const bot = await prisma.wABot.findFirst({
      where: { id, ...(await orgWhere(session.user.id)) },
    });

    if (!bot) {
      return NextResponse.json({ error: "Bot no encontrado" }, { status: 404 });
    }

    await unlinkKnowledgeFromBot(kid, id);

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
