import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getContactScopeIds } from "@/lib/appointments";
import { publicErrorMessage } from "@/lib/api-errors";

// Búsqueda de contacto acotada para el picker del formulario de Citas —
// deliberadamente separada de GET /api/whatsapp/contacts (que 403s para el
// rol "user", ver AGENTS.md "Role guards live in the APIs too"). Esa
// restricción es sobre la página/gestión de Contactos; agendar una cita no
// debería heredarla, así que este endpoint no aplica el mismo gate de rol.
const LIMIT = 8;

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") ?? "").trim();
    if (q.length < 1) return NextResponse.json([]);

    const { accountIds, channelAccountIds } = await getContactScopeIds(session.user.id);

    const contacts = await prisma.contact.findMany({
      where: {
        AND: [
          { OR: [{ accountId: { in: accountIds } }, { channelAccountId: { in: channelAccountIds } }] },
          {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { realName: { contains: q, mode: "insensitive" } },
              { remoteJid: { contains: q, mode: "insensitive" } },
            ],
          },
        ],
      },
      select: { id: true, name: true, realName: true, remoteJid: true },
      orderBy: { updatedAt: "desc" },
      take: LIMIT,
    });

    return NextResponse.json(contacts);
  } catch (error) {
    const message = publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
