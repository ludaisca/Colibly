import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { deleteOrgByOperator } from "@/lib/platform/ops";
import { opsResponse } from "@/lib/platform/http";
import { rateLimit } from "@/lib/rate-limit";
import { publicErrorMessage } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

const schema = z.object({ confirmName: z.string().min(1).max(200), reason: z.string().min(5).max(500) });

// Panel /plataforma → organización → Eliminar. Borrado definitivo, solo por
// sesión de operador: no se expone en la API de tokens ni en el MCP.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformAdmin();
  if (admin instanceof NextResponse) return admin;
  if (!(await rateLimit(`platform-org-delete:${admin.email}`, 10, 3600)).allowed) {
    return NextResponse.json({ error: { code: "rate_limited", message: "Demasiadas eliminaciones; espera una hora" } }, { status: 429 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "invalid_request", message: "Escribe el nombre de la organización y el motivo (mínimo 5 caracteres)" } },
      { status: 400 }
    );
  }
  const { id } = await params;
  try {
    return opsResponse(await deleteOrgByOperator(id, parsed.data, { type: "user", email: admin.email }));
  } catch (error) {
    return NextResponse.json(
      { error: { code: "internal", message: publicErrorMessage(error, "No se pudo eliminar la organización") } },
      { status: 500 }
    );
  }
}
