import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireOrgId } from "@/lib/tenancy";
import { appUrl } from "@/lib/email/mailer";
import { getStripe, isStripeConfigured } from "@/lib/billing/stripe";

// Portal de cliente de Stripe: cambiar de plan, de tarjeta, ver facturas y
// cancelar. Los cambios vuelven por el webhook.
export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Solo un administrador puede administrar la facturación" }, { status: 403 });
    }
    if (!(await isStripeConfigured())) return NextResponse.json({ error: "Los pagos aún no están habilitados." }, { status: 503 });
    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: await requireOrgId(session.user.id) },
      select: { stripeCustomerId: true },
    });
    if (!org.stripeCustomerId) {
      return NextResponse.json({ error: "Aún no tienes una suscripción. Elige un plan primero." }, { status: 400 });
    }
    const stripe = await getStripe();
    const portal = await stripe.billingPortal.sessions.create({
      customer: org.stripeCustomerId,
      return_url: appUrl("/configuracion/plan"),
    });
    return NextResponse.json({ url: portal.url });
  } catch (error) {
    console.error("[billing/portal]", error);
    return NextResponse.json({ error: "No se pudo abrir la facturación. Intenta de nuevo en un momento." }, { status: 500 });
  }
}
