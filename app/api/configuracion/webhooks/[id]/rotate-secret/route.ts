import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/integrations/admin-session";
import { rotateWebhookSecret } from "@/lib/webhooks/crud";
import { publicErrorMessage } from "@/lib/api-errors";

type Params = { params: Promise<{ id: string }> };

// Rotar el secreto: el anterior deja de firmar de inmediato, así que el
// receptor debe actualizarse con el nuevo (se muestra una sola vez).
export async function POST(_req: Request, { params }: Params) {
  try {
    const admin = await requireAdmin();
    if (admin instanceof NextResponse) return admin;
    const { id } = await params;
    const secret = await rotateWebhookSecret(admin.userId, id);
    if (!secret) return NextResponse.json({ error: "Webhook no encontrado" }, { status: 404 });
    return NextResponse.json({ secret });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}
