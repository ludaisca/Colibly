import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { requireOrgId } from "@/lib/tenancy";
import { requireVerifiedEmail } from "@/lib/auth-emails";
import { appUrl } from "@/lib/email/mailer";
import { getStripe, isStripeConfigured, priceIdFor } from "@/lib/billing/stripe";
import { getSeatUsage } from "@/lib/billing/gates";
import { planChangeImpact } from "@/lib/billing/state";
import { MAX_SEATS, MIN_SEATS } from "@/lib/billing/plans";

const schema = z.object({
  plan: z.enum(["ESSENTIAL", "BUSINESS", "PRO"]),
  // Asientos = ejecutivos a cobrar (quantity del item). Mínimo: los ocupados hoy.
  seats: z.number().int().min(MIN_SEATS).max(MAX_SEATS),
  confirm: z.boolean().optional().default(false),
});

// Stripe exige que el fin de la prueba de una Checkout Session esté al menos
// 48 h en el futuro; con menos margen se cobra de inmediato.
const MIN_TRIAL_MS = 49 * 60 * 60 * 1000;

// Abre Stripe Checkout para suscribirse a un plan por asiento (solo admin,
// correo verificado): quantity = ejecutivos elegidos (mínimo los ocupados). Si la organización sigue en prueba, el primer cobro se hace al
// terminar la prueba: suscribirse antes no le quita días.
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Solo un administrador puede cambiar el plan" }, { status: 403 });
    }
    const { allowed } = await rateLimit(`billing-checkout:${session.user.id}`, 10, 600);
    if (!allowed) return NextResponse.json({ error: "Demasiados intentos, espera un momento" }, { status: 429 });
    if (!(await isStripeConfigured())) {
      return NextResponse.json({ error: "Los pagos aún no están habilitados. Escríbenos para activar tu plan." }, { status: 503 });
    }
    const unverified = await requireVerifiedEmail(session.user.id);
    if (unverified) return unverified;

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: `Elige un plan y entre ${MIN_SEATS} y ${MAX_SEATS} ejecutivos` }, { status: 400 });

    const organizationId = await requireOrgId(session.user.id);
    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { id: true, name: true, status: true, isInternal: true, trialEndsAt: true, stripeCustomerId: true, stripeSubscriptionId: true },
    });
    if (org.isInternal) return NextResponse.json({ error: "Esta cuenta interna no requiere plan" }, { status: 400 });
    if (org.stripeSubscriptionId && org.status !== "CANCELED") {
      return NextResponse.json(
        { error: "Ya tienes una suscripción. Cambia plan o asientos desde esta pantalla; la tarjeta, desde “Administrar facturación”.", code: "has_subscription" },
        { status: 409 }
      );
    }

    // Nunca menos asientos que los ocupados; avisar lo que se pierde (p. ej.
    // de la prueba Pro a Esencial o Negocio) antes de mandar a pagar.
    const impact = planChangeImpact(parsed.data.plan, parsed.data.seats, await getSeatUsage(org.id));
    if (impact.blockers.length > 0) return NextResponse.json({ error: impact.blockers[0], code: "blocked", impact }, { status: 409 });
    if (impact.warnings.length > 0 && !parsed.data.confirm) {
      return NextResponse.json({ error: "Revisa lo que cambia antes de continuar.", code: "confirm_required", impact }, { status: 409 });
    }

    const stripe = await getStripe();
    let customerId = org.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create(
        { email: session.user.email, name: org.name, metadata: { organizationId: org.id } },
        // Dos clics seguidos no crean dos clientes en Stripe.
        { idempotencyKey: `customer-${org.id}` }
      );
      customerId = customer.id;
      await prisma.organization.update({ where: { id: org.id }, data: { stripeCustomerId: customerId } });
    }

    const trialEnd = org.status === "TRIALING" && org.trialEndsAt && org.trialEndsAt.getTime() - Date.now() > MIN_TRIAL_MS ? org.trialEndsAt : null;
    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: org.id,
      line_items: [{ price: await priceIdFor(parsed.data.plan), quantity: parsed.data.seats }],
      subscription_data: {
        metadata: { organizationId: org.id },
        ...(trialEnd ? { trial_end: Math.floor(trialEnd.getTime() / 1000) } : {}),
      },
      allow_promotion_codes: true,
      success_url: appUrl("/configuracion/plan?checkout=ok"),
      cancel_url: appUrl("/configuracion/plan?checkout=cancelado"),
    });
    if (!checkout.url) throw new Error("Stripe no devolvió la URL de pago");
    return NextResponse.json({ url: checkout.url });
  } catch (error) {
    console.error("[billing/checkout]", error);
    return NextResponse.json({ error: "No se pudo abrir el pago. Intenta de nuevo en un momento." }, { status: 500 });
  }
}
