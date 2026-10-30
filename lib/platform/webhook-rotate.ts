import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/app-url";
import { getStripe } from "@/lib/billing/stripe";
import { getPlatformSettings, updatePlatformSettings } from "@/lib/platform-settings";

// Rotación y auto-prueba del webhook de Stripe. La rotación crea el endpoint
// nuevo, guarda su secret y solo entonces borra el viejo: si algo falla, el
// anterior sigue recibiendo eventos. Los eventos son idempotentes por
// StripeEvent, así que una ventana breve con dos endpoints no duplica nada.

export const PLATFORM_WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "invoice.paid",
  "invoice.payment_failed",
] as const;

export async function rotateStripeWebhook(actorEmail: string): Promise<{ endpointId: string; url: string; events: string[] }> {
  const stripe = await getStripe();
  const url = appUrl("/api/billing/webhook");
  const existing = await stripe.webhookEndpoints.list({ limit: 20 });

  const created = await stripe.webhookEndpoints.create({
    url,
    description: `Colibly ${process.env.NODE_ENV === "production" ? "producción" : "dev"}`,
    enabled_events: [...PLATFORM_WEBHOOK_EVENTS],
    metadata: { colibly_env: process.env.NODE_ENV === "production" ? "production" : "dev" },
  });

  try {
    await updatePlatformSettings({ stripeWebhookSecret: created.secret }, actorEmail);
  } catch (error) {
    // No dejar un endpoint huérfano si no se pudo guardar el secret.
    await stripe.webhookEndpoints.del(created.id).catch(() => undefined);
    throw error;
  }

  const old = existing.data.filter((endpoint) => endpoint.url === url && endpoint.id !== created.id);
  for (const endpoint of old) {
    await stripe.webhookEndpoints.del(endpoint.id).catch((error) => {
      console.warn(`[plataforma] no se pudo borrar el webhook viejo ${endpoint.id}:`, error instanceof Error ? error.message : error);
    });
  }

  return { endpointId: created.id, url, events: [...PLATFORM_WEBHOOK_EVENTS] };
}

export async function testStripeWebhook(): Promise<{ status: number; ok: boolean; message: string }> {
  const { stripeWebhookSecret } = await getPlatformSettings();
  if (!stripeWebhookSecret) throw new Error("El webhook secret no está configurado");

  const stripe = await getStripe();
  const event = {
    id: `evt_colibly_ping_${Date.now()}`,
    object: "event",
    api_version: "2026-09-30.endive",
    created: Math.floor(Date.now() / 1000),
    data: { object: {} },
    livemode: (await getPlatformSettings()).stripeSecretKey?.startsWith("sk_live_") ?? false,
    pending_webhooks: 0,
    request: null,
    type: "colibly.ping",
  };
  const payload = JSON.stringify(event);
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: stripeWebhookSecret });

  const response = await fetch(appUrl("/api/billing/webhook"), {
    method: "POST",
    headers: { "Content-Type": "application/json", "Stripe-Signature": signature },
    body: payload,
    signal: AbortSignal.timeout(20_000),
  }).catch((error) => {
    throw new Error(`No se pudo alcanzar el webhook: ${error instanceof Error ? error.message : "error de red"}`);
  });

  // El handler guarda el evento después de validar; el ping no debe quedar en
  // el historial real.
  await prisma.stripeEvent.deleteMany({ where: { id: event.id } }).catch(() => undefined);

  const body = await response.text().catch(() => "");
  return {
    status: response.status,
    ok: response.ok,
    message: response.ok ? "El webhook aceptó la firma y respondió 200" : `Respondió ${response.status}: ${body.slice(0, 200)}`,
  };
}
