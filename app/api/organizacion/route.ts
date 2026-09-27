import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { auth, invalidateUserSessionCache } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { requireOrgId } from "@/lib/tenancy";
import { deleteOrganizationData } from "@/lib/org-data/delete";
import { publicErrorMessage } from "@/lib/api-errors";

const deleteSchema = z.object({
  confirmName: z.string().trim().min(1, "Escribe el nombre de la organización para confirmar"),
  password: z.string().min(1, "Escribe tu contraseña"),
});

// Eliminar la organización con todos sus datos (irreversible). Solo el dueño,
// confirmando con el nombre de la organización y su contraseña. Funciona también
// en solo lectura o cancelada (proxy.ts la deja pasar): borrarse es una salida.
export async function DELETE(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { allowed } = await rateLimit(`org-delete:${session.user.id}`, 5, 60);
    if (!allowed) return NextResponse.json({ error: "Demasiados intentos. Intenta de nuevo en un minuto." }, { status: 429 });

    const parsed = deleteSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

    const organizationId = await requireOrgId(session.user.id);
    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { name: true, ownerId: true, isInternal: true, members: { select: { id: true } } },
    });
    if (org.ownerId !== session.user.id) {
      return NextResponse.json({ error: "Solo el dueño de la organización puede eliminarla" }, { status: 403 });
    }
    if (org.isInternal) return NextResponse.json({ error: "Esta organización no se puede eliminar" }, { status: 403 });
    if (parsed.data.confirmName.toLocaleLowerCase("es") !== org.name.trim().toLocaleLowerCase("es")) {
      return NextResponse.json({ error: "El nombre no coincide con el de tu organización" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { password: true } });
    if (!user?.password || !(await bcrypt.compare(parsed.data.password, user.password))) {
      return NextResponse.json({ error: "Contraseña incorrecta" }, { status: 400 });
    }

    await deleteOrganizationData(organizationId);
    // Las sesiones abiertas de los miembros se invalidan ya, no en la próxima revalidación.
    for (const m of org.members) invalidateUserSessionCache(m.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "No se pudo eliminar la organización. Intenta de nuevo.") }, { status: 500 });
  }
}
