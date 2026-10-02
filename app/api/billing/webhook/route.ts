import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getStripe, getStripeWebhookSecret, syncSubscription } from "@/lib/billing/stripe";
import { resetAiCredits } from "@/lib/ai/credits";

// Webhook de Stripe. Firma verificada con el webhook secret configurado en
// /plataforma sobre el cuerpo crudo. Cada evento se procesa releyendo la
// suscripción (syncSubscription), así que repetir uno es inofensivo;
// StripeEvent además evita trabajo doble. Si el procesamiento falla se
// responde 500 y Stripe reintenta.

function subscriptionIdOf(ref: string | { id: string } | null | undefined): string | null {
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id;
}

async function handle(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const subscriptionId = subscriptionIdOf(session.subscription);
      if (session.mode === "subscription" && subscriptionId) {
        await syncSubscription(subscriptionId, session.client_reference_id);
      }
      return;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed":
      await syncSubscription(event.data.object.id);
      return;
    case "invoice.paid":
    case "invoice.payment_failed": {
      const invoice = event.data.object;
      const subscriptionId = subscriptionIdOf(invoice.parent?.subscription_details?.subscription);
      if (!subscriptionId) return;
      const organizationId = await syncSubscription(subscriptionId);
      // Cada periodo pagado (alta o renovación) trae créditos de IA nuevos.
      // Una factura de $0 (prueba) no reinicia: la prueba ya tiene los suyos.
      if (
        organizationId &&
        event.type === "invoice.paid" &&
        invoice.amount_paid > 0 &&
        (invoice.billing_reason === "subscription_cycle" || invoice.billing_reason === "subscription_create")
      ) {
        await resetAiCredits(organizationId);
      }
      return;
    }
    default:
      return;
  }
}

export async function POST(req: Request) {
  const secret = await getStripeWebhookSecret();
  if (!secret) return NextResponse.json({ error: "Webhook de Stripe no configurado" }, { status: 503 });

  const signature = req.headers.get("stripe-signature");
  const body = await req.text();
  let event: Stripe.Event;
  try {
    if (!signature) throw new Error("Falta stripe-signature");
    event = (await getStripe()).webhooks.constructEvent(body, signature, secret);
  } catch (err) {
    console.warn("[billing/webhook] Firma inválida:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Firma inválida" }, { status: 400 });
  }

  if (await prisma.stripeEvent.findUnique({ where: { id: event.id }, select: { id: true } })) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    await handle(event);
  } catch (err) {
    console.error(`[billing/webhook] Error procesando ${event.type} (${event.id}):`, err);
    return NextResponse.json({ error: "Error procesando el evento" }, { status: 500 });
  }

  try {
    await prisma.stripeEvent.create({ data: { id: event.id, type: event.type } });
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
  }
  return NextResponse.json({ received: true });
}
