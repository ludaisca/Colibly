import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publicErrorMessage } from "@/lib/api-errors";

// Sin cuerpo: marca todo como leído y devuelve los ids que cambió.
// Con `{ ids, read: false }`: los vuelve a "sin leer" ("Deshacer" de la campana).
const undoSchema = z.object({ ids: z.array(z.string().min(1).max(64)).min(1).max(200), read: z.literal(false) });

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (body) {
      const parsed = undoSchema.safeParse(body);
      if (!parsed.success) return NextResponse.json({ error: "Datos no válidos" }, { status: 400 });
      const { count } = await prisma.notification.updateMany({
        where: { userId: session.user.id, id: { in: parsed.data.ids } },
        data: { read: false },
      });
      return NextResponse.json({ success: true, count });
    }

    // Los ids se leen antes de marcar para poder deshacer exactamente esos.
    const unread = await prisma.notification.findMany({
      where: { userId: session.user.id, read: false },
      select: { id: true },
      take: 200,
      orderBy: { createdAt: "desc" },
    });
    await prisma.notification.updateMany({
      where: { userId: session.user.id, read: false },
      data: { read: true },
    });

    return NextResponse.json({ success: true, ids: unread.map((n) => n.id) });
  } catch (error) {
    const message =
      publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
