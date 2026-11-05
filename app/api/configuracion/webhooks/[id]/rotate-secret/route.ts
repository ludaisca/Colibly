import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/integrations/admin-session";
import { rotateWebhookSecret } from "@/lib/webhooks/crud";
import { publicErrorMessage } from "@/lib/api-errors";

type Params = { params: Promise<{ id: string }> };

// Rotar el secreto (se muestra una sola vez). `graceHours` > 0: el anterior
// sigue firmando ese tiempo (segunda v1); 0 o sin cuerpo: deja de firmar ya.
export async function POST(req: Request, { params }: Params) {
  try {
    const admin = await requireAdmin();
    if (admin instanceof NextResponse) return admin;
    const { id } = await params;
    const body = await req.json().catch(() => null);
    const graceHours = typeof body?.graceHours === "number" ? body.graceHours : 0;
    const rotated = await rotateWebhookSecret(admin.userId, id, graceHours);
    if (!rotated) return NextResponse.json({ error: "Webhook no encontrado" }, { status: 404 });
    return NextResponse.json({ secret: rotated.secret, previousSecretExpiresAt: rotated.previousSecretExpiresAt });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}
