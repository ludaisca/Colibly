import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { requireOrgId } from "@/lib/tenancy";
import { publicErrorMessage } from "@/lib/api-errors";
import { changeUserLicense, licenseResultResponse } from "@/lib/billing/license-billing";

const schema = z.object({
  license: z.enum(["ESSENTIAL", "BUSINESS", "PRO"]),
  // Lo que deja de funcionar ya se mostró y el admin lo aceptó.
  confirm: z.boolean().optional().default(false),
  // Sin licencia libre del plan destino: comprar una y soltar la anterior.
  adjustBilling: z.boolean().optional().default(false),
});

// Cambiar la licencia de una persona (solo admin). Reglas y cobro en
// lib/billing/license-billing.ts:changeUserLicense().
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    const { allowed } = await rateLimit(`user-license:${session.user.id}`, 20, 600);
    if (!allowed) return NextResponse.json({ error: "Demasiados cambios seguidos, espera un momento" }, { status: 429 });

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

    const { id } = await params;
    const result = await changeUserLicense(await requireOrgId(session.user.id), id, parsed.data.license, parsed.data);
    if (!result.ok) return licenseResultResponse(result);
    return NextResponse.json({ ok: true, changed: result.changed });
  } catch (error) {
    console.error("[usuarios/licencia]", error);
    return NextResponse.json({ error: publicErrorMessage(error, "No se pudo cambiar la licencia") }, { status: 500 });
  }
}
