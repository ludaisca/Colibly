import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { requireOrgId } from "@/lib/tenancy";
import { exportOrganizationData } from "@/lib/org-data/export";

export const dynamic = "force-dynamic";

// Descarga de todos los datos de la organización en JSON (solo admin). Es GET,
// así que también funciona en solo lectura o cancelada.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Solo un administrador puede exportar los datos" }, { status: 403 });

  // Una exportación recorre toda la base de la organización: pocas por hora.
  const { allowed } = await rateLimit(`org-export:${session.user.id}`, 5, 3600);
  if (!allowed) return NextResponse.json({ error: "Ya exportaste varias veces en la última hora. Intenta más tarde." }, { status: 429 });

  const organizationId = await requireOrgId(session.user.id);
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true } });

  const encoder = new TextEncoder();
  const chunks = exportOrganizationData(organizationId);
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await chunks.next();
        if (done) controller.close();
        else controller.enqueue(encoder.encode(value));
      } catch (err) {
        // Ya se enviaron los encabezados: cortar el stream deja el JSON
        // incompleto (inválido) en vez de uno truncado que parezca bueno.
        console.error("[org-export]", err);
        controller.error(err);
      }
    },
    async cancel() {
      await chunks.return(undefined);
    },
  });

  const slug = org.name.normalize("NFD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "organizacion";
  const date = new Date().toISOString().slice(0, 10);
  return new Response(stream, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="colibly-${slug}-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
