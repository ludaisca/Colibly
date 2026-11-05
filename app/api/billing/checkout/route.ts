import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { requireOrgId } from "@/lib/tenancy";
import { requireVerifiedEmail } from "@/lib/auth-emails";
import { appUrl } from "@/lib/email/mailer";
import { expireOtherOpenCheckouts, getStripe, isStripeConfigured, planPriceError, priceIdFor } from "@/lib/billing/stripe";
import { getOrgUsage } from "@/lib/billing/gates";
import { MAX_SEATS, MIN_SEATS } from "@/lib/billing/plans";
import { licenseCheckoutIdempotencyKey, licenseLineItems, checkoutSessionParams } from "@/lib/billing/stripe-rules";
import { LICENSE_ORDER, licenseTargetBlockers, totalLicenses, type LicenseCounts } from "@/lib/billing/licenses";
import { getLicenseState } from "@/lib/billing/license-billing";
import { licenseCountsSchema } from "@/lib/validations";
import { PLANS } from "@/lib/billing/plans";
import type { PlanId } from "@prisma/client";
import { getPlatformSettings } from "@/lib/platform-settings";

// Licencias por plan (una línea de Stripe por plan). Se acepta todavía la
// forma anterior {plan, seats} = N licencias de ese plan.
const schema = z.union([
  z.object({ licenses: licenseCountsSchema, confirm: z.boolean().optional().default(false) }),
  z.object({
    plan: z.enum(["ESSENTIAL", "BUSINESS", "PRO"]),
    seats: z.number().int().min(MIN_SEATS).max(MAX_SEATS),
    confirm: z.boolean().optional().default(false),
  }),
]);

// Stripe exige que el fin de la prueba de una Checkout Session esté al menos
// 48 h en el futuro; con menos margen se cobra de inmediato.
const MIN_TRIAL_MS = 49 * 60 * 60 * 1000;

// Abre Stripe Checkout para contratar licencias (solo admin, correo
// verificado): una línea por plan con quantity = licencias de ese plan, nunca
// menos que las asignadas. Si la organización sigue en prueba, el primer cobro
// se hace al terminar la prueba: suscribirse antes no le quita días.
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
    if (!parsed.success) return NextResponse.json({ error: `Elige entre ${MIN_SEATS} y ${MAX_SEATS} licencias` }, { status: 400 });
    const counts: LicenseCounts =
      "licenses" in parsed.data ? parsed.data.licenses : { ESSENTIAL: 0, BUSINESS: 0, PRO: 0, [parsed.data.plan]: parsed.data.seats };

    for (const plan of LICENSE_ORDER) {
      if (counts[plan] === 0) continue;
      const priceError = await planPriceError(plan);
      if (priceError) return NextResponse.json({ error: priceError, code: "price_mismatch" }, { status: 503 });
    }

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

    // Nunca menos licencias de un plan que las asignadas (personas e
    // invitaciones); avisar los canales que quedarían sin dueño (Básico).
    const state = await getLicenseState(org.id);
    const blockers = licenseTargetBlockers(counts, state?.assigned ?? counts, (id: PlanId) => PLANS[id].name);
    if (blockers.length > 0) return NextResponse.json({ error: blockers[0], code: "blocked", impact: { blockers, warnings: [] } }, { status: 409 });
    const usage = await getOrgUsage(org.id);
    const total = totalLicenses(counts);
    const warnings = (["whatsapp", "instagram", "messenger", "telegram", "webchat"] as const)
      .filter((k) => usage[k] > total)
      .map((k) => `Tienes ${usage[k]} canales de ${k === "whatsapp" ? "WhatsApp" : k === "webchat" ? "chat web" : k[0].toUpperCase() + k.slice(1)} y cada licencia incluye uno: ${usage[k] - total} quedarán sin dueño y funcionarán como Básico.`);
    if (warnings.length > 0 && !parsed.data.confirm) {
      return NextResponse.json({ error: "Revisa lo que cambia antes de continuar.", code: "confirm_required", impact: { blockers: [], warnings } }, { status: 409 });
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
    const trialEndUnix = trialEnd ? Math.floor(trialEnd.getTime() / 1000) : null;
    const prices = Object.fromEntries(await Promise.all(LICENSE_ORDER.map(async (p) => [p, await priceIdFor(p)] as const))) as Record<PlanId, string>;
    const params = checkoutSessionParams({
      customerId,
      organizationId: org.id,
      lineItems: licenseLineItems(counts, (p) => prices[p]),
      trialEnd: trialEndUnix,
      automaticTax: (await getPlatformSettings()).stripeAutomaticTax,
      successUrl: appUrl("/configuracion/plan?checkout=ok"),
      cancelUrl: appUrl("/configuracion/plan?checkout=cancelado"),
    });
    // Doble clic o reintento: misma sesión durante 10 min (stripe-rules.ts).
    const checkout = await stripe.checkout.sessions.create(params, {
      idempotencyKey: licenseCheckoutIdempotencyKey({ organizationId: org.id, customerId, counts, trialEnd: trialEndUnix }, Date.now()),
    });
    if (!checkout.url) throw new Error("Stripe no devolvió la URL de pago");
    // Una sola sesión abierta por cliente: pagar dos crearía dos suscripciones.
    await expireOtherOpenCheckouts(customerId, checkout.id);
    return NextResponse.json({ url: checkout.url });
  } catch (error) {
    console.error("[billing/checkout]", error);
    return NextResponse.json({ error: "No se pudo abrir el pago. Intenta de nuevo en un momento." }, { status: 500 });
  }
}
