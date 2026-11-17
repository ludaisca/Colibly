import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { issueUserPasswordReset } from "@/lib/platform/support";
import { opsResponse } from "@/lib/platform/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const schema = z.object({ reason: z.string().min(5).max(500), mode: z.enum(["email", "link"]) });

// Panel /plataforma → Soporte: restablecer la contraseña de un usuario (correo
// o enlace de un solo uso). Solo por sesión de operador: el enlace es una
// credencial y no se expone en la API de tokens ni en el MCP.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformAdmin();
  if (admin instanceof NextResponse) return admin;
  if (!(await rateLimit(`platform-password-reset:${admin.email}`, 10, 3600)).allowed) {
    return NextResponse.json({ error: { code: "rate_limited", message: "Demasiados restablecimientos; espera una hora" } }, { status: 429 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "invalid_request", message: "Escribe el motivo (mínimo 5 caracteres)" } }, { status: 400 });
  const { id } = await params;
  return opsResponse(await issueUserPasswordReset({ userId: id, reason: parsed.data.reason, mode: parsed.data.mode, actor: { type: "user", email: admin.email } }));
}
