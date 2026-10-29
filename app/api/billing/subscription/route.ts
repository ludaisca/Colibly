import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { requireOrgId } from "@/lib/tenancy";
import { requireVerifiedEmail } from "@/lib/auth-emails";
import { isStripeConfigured, planPriceError } from "@/lib/billing/stripe";
import { applyPlanChange } from "@/lib/billing/seats";
import { MAX_SEATS, MIN_SEATS } from "@/lib/billing/plans";

const schema = z.object({
  plan: z.enum(["ESSENTIAL", "BUSINESS", "PRO"]),
  seats: z.number().int().min(MIN_SEATS).max(MAX_SEATS),
  confirm: z.boolean().optional().default(false),
});

// Cambiar asientos (ejecutivos) y/o plan de la suscripción vigente (solo
// admin). Stripe prorratea; el detalle de bloqueos y avisos sale de
// lib/billing/state.ts:planChangeImpact().
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Solo un administrador puede cambiar el plan" }, { status: 403 });
    }
    const { allowed } = await rateLimit(`billing-subscription:${session.user.id}`, 10, 600);
    if (!allowed) return NextResponse.json({ error: "Demasiados intentos, espera un momento" }, { status: 429 });
    if (!(await isStripeConfigured())) {
      return NextResponse.json({ error: "Los pagos aún no están habilitados. Escríbenos para cambiar tu plan." }, { status: 503 });
    }
    const unverified = await requireVerifiedEmail(session.user.id);
    if (unverified) return unverified;

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: `Elige un plan y entre ${MIN_SEATS} y ${MAX_SEATS} ejecutivos` }, { status: 400 });

    const priceError = await planPriceError(parsed.data.plan);
    if (priceError) return NextResponse.json({ error: priceError, code: "price_mismatch" }, { status: 503 });

    const result = await applyPlanChange(await requireOrgId(session.user.id), parsed.data);
    if (!result.ok) return NextResponse.json({ error: result.error, code: result.code, impact: result.impact, invoiceUrl: result.invoiceUrl }, { status: result.status });
    return NextResponse.json({ ok: true, changed: result.changed });
  } catch (error) {
    console.error("[billing/subscription]", error);
    return NextResponse.json({ error: "No se pudo actualizar tu suscripción. Intenta de nuevo en un momento." }, { status: 500 });
  }
}
