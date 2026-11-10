import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { contactScopeWhere } from "@/lib/contacts/scope";
import { publicErrorMessage } from "@/lib/api-errors";

async function ownedContact(userId: string, contactId: string) {
  const scope = await contactScopeWhere(userId);
  return prisma.contact.findFirst({
    where: { id: contactId, ...scope },
    select: { id: true },
  });
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const contact = await ownedContact(session.user.id, id);
    if (!contact) {
      return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });
    }

    const limit = Math.min(Math.max(Number(new URL(req.url).searchParams.get("limit")) || 50, 1), 100);
    const items = await prisma.contactActivity.findMany({
      where: { contactId: id },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        metadata: true,
        createdAt: true,
        actor: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ items });
  } catch (error) {
    const message = publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
