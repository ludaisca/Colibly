import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { forbidRoles } from "@/lib/roles";
import { requireOrgId } from "@/lib/tenancy";
import { requireVerifiedEmail } from "@/lib/auth-emails";
import { checkPlanLimit } from "@/lib/billing/gates";
import { publicErrorMessage } from "@/lib/api-errors";
import { completeEmbeddedSignup, EmbeddedSignupError } from "@/lib/whatsapp/embedded-signup/complete";
import { realEmbeddedSignupDeps, requirePlatformApp } from "@/lib/whatsapp/embedded-signup/service";
import { emitAccountConnected } from "@/lib/whatsapp/onboarding-links";

const bodySchema = z.object({
  code: z.string().min(10).max(4000),
  wabaId: z.string().regex(/^\d{5,25}$/, "waba_id inválido"),
  // El evento de coexistencia solo trae waba_id: el número se resuelve en el servidor.
  phoneNumberId: z.string().regex(/^\d{5,25}$/, "phone_number_id inválido").nullable().optional(),
  coexistence: z.boolean().optional().default(false),
  name: z.string().trim().min(1).max(80).optional(),
});

// Cierra el alta con Embedded Signup: el navegador entrega el `code` y los ids
// que devolvió el diálogo de Meta; aquí se cambia por el token del cliente, se
// suscriben los webhooks, se registra el número (si no es coexistencia) y se
// crea la cuenta en la organización de quien conecta.
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const denied = forbidRoles(session, ["ejecutivo"]);
    if (denied) return denied;

    const unverified = await requireVerifiedEmail(session.user.id);
    if (unverified) return unverified;
    const organizationId = await requireOrgId(session.user.id);
    const overLimit = await checkPlanLimit(organizationId, "whatsapp");
    if (overLimit) return overLimit; // 1 número de WhatsApp por asiento

    const { allowed } = await rateLimit(`embedded-signup:${session.user.id}`, 10, 60);
    if (!allowed) return NextResponse.json({ error: "Demasiadas solicitudes, espera un momento" }, { status: 429 });

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

    const app = await requirePlatformApp();
    const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { whatsappCoexistenceEnabled: true } });

    const result = await completeEmbeddedSignup(
      {
        userId: session.user.id,
        organizationId,
        code: parsed.data.code,
        wabaId: parsed.data.wabaId,
        phoneNumberId: parsed.data.phoneNumberId ?? null,
        coexistenceRequested: parsed.data.coexistence,
        coexistenceAllowed: !!org?.whatsappCoexistenceEnabled,
        name: parsed.data.name,
      },
      app,
      realEmbeddedSignupDeps(app)
    );

    await emitAccountConnected(result.accountId, { coexistence: result.coexistence, via: "app" });
    return NextResponse.json(
      { id: result.accountId, coexistence: result.coexistence, syncDeadlineAt: result.syncDeadlineAt, registered: result.registered },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof EmbeddedSignupError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: publicErrorMessage(error, "No se pudo conectar el número de WhatsApp") }, { status: 500 });
  }
}
