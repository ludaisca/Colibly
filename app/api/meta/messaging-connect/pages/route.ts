import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { forbidRoles } from "@/lib/roles";
import { rateLimit } from "@/lib/rate-limit";
import { requireVerifiedEmail } from "@/lib/auth-emails";
import { requireOrgId } from "@/lib/tenancy";
import { MessagingConnectError, startMessagingConnect } from "@/lib/meta-messaging/platform-connect";

const schema = z.object({ code: z.string().min(10).max(2000) });

// Paso 1 de "Conectar con Facebook": canjea el código del diálogo y devuelve
// las Páginas autorizadas (sin tokens: quedan cifrados en el servidor).
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const denied = forbidRoles(session, ["ejecutivo"]);
    if (denied) return denied;
    const unverified = await requireVerifiedEmail(session.user.id);
    if (unverified) return unverified;
    const { allowed } = await rateLimit(`meta-msg-connect:${session.user.id}`, 10, 600);
    if (!allowed) return NextResponse.json({ error: "Demasiados intentos, espera unos minutos" }, { status: 429 });

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Falta la autorización de Facebook" }, { status: 400 });
    const organizationId = await requireOrgId(session.user.id);
    return NextResponse.json(await startMessagingConnect(session.user.id, organizationId, parsed.data.code));
  } catch (error) {
    if (error instanceof MessagingConnectError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[meta messaging-connect/pages]", error);
    return NextResponse.json({ error: "No se pudo leer tus Páginas de Facebook" }, { status: 500 });
  }
}
