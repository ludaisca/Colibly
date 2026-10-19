import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireOrgId } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { getOrgBilling, getSeatUsage, invalidateOrgBilling } from "@/lib/billing/gates";
import { accessMode, aiCreditLimit, planLimits, seatCap } from "@/lib/billing/state";
import { isStripeConfigured } from "@/lib/billing/stripe";
import { SEAT_CHANNEL_LABELS, SEAT_CHANNELS } from "@/lib/billing/plans";
import { PlanView, type PlanViewData } from "./_view";

// Plan y facturación (solo admin): estado, asientos, consumo y pago.
export default async function PlanPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (session.user.role !== "admin") redirect("/configuracion");

  const organizationId = await requireOrgId(session.user.id);
  // Recién vuelto de Stripe el estado puede haber cambiado por el webhook.
  invalidateOrgBilling(organizationId);
  const [org, usage, owner] = await Promise.all([
    getOrgBilling(organizationId),
    getSeatUsage(organizationId),
    prisma.organization.findUnique({ where: { id: organizationId }, select: { ownerId: true } }),
  ]);
  if (!org) redirect("/configuracion");

  const now = new Date();
  const limits = planLimits(org);
  const finite = (n: number) => (Number.isFinite(n) ? n : null);
  const paidSeats = seatCap(org);
  const trialing = org.status === "TRIALING" && !org.isInternal;
  const poolHint = (what: string) => (trialing ? `Bolsa fija de la prueba para toda la organización (no se multiplica por ${what})` : `Bolsa de la organización: ${what} por ejecutivo × asientos`);

  const data: PlanViewData = {
    organizationName: org.name,
    isOwner: owner?.ownerId === session.user.id,
    plan: org.plan,
    status: org.status,
    isInternal: org.isInternal,
    access: accessMode(org, now),
    trialEndsAt: org.trialEndsAt?.toISOString() ?? null,
    graceEndsAt: org.graceEndsAt?.toISOString() ?? null,
    currentPeriodEnd: org.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: org.cancelAtPeriodEnd,
    hasSubscription: !!org.stripeSubscriptionId && org.status !== "CANCELED",
    hasCustomer: !!org.stripeCustomerId,
    stripeConfigured: await isStripeConfigured(),
    // Stripe solo difiere el primer cobro si quedan más de 48 h de prueba.
    chargeDeferredToTrialEnd: org.status === "TRIALING" && !!org.trialEndsAt && org.trialEndsAt.getTime() - now.getTime() > 49 * 60 * 60 * 1000,
    seatsUsed: usage.seats,
    apiKeys: usage.apiKeys,
    webhooks: usage.webhooks,
    webchat: usage.webchat,
    seatsPaid: Number.isFinite(paidSeats) ? paidSeats : null,
    usage: [
      { key: "seats", label: "Ejecutivos (asientos)", hint: "Usuarios activos e invitaciones pendientes; dueño y admins cuentan", used: usage.seats, max: finite(limits.seats) },
      { key: "whatsapp", label: "Números de WhatsApp", hint: "1 por ejecutivo, con Coexistencia", used: usage.whatsapp, max: finite(limits.whatsapp) },
      ...SEAT_CHANNELS.map((ch) => ({
        key: ch,
        label: `Cuentas de ${SEAT_CHANNEL_LABELS[ch]}`,
        hint: "1 por ejecutivo, por habilitación",
        used: usage[ch],
        max: finite(limits[ch]),
      })),
      { key: "contacts", label: "Contactos", hint: trialing ? poolHint("ejecutivos") : poolHint("contactos"), used: usage.contacts, max: finite(limits.contacts) },
      { key: "automations", label: "Automatizaciones activas", hint: null, used: usage.activeAutomations, max: finite(limits.activeAutomations) },
      {
        key: "ai",
        label: "Créditos de IA este mes",
        hint: !limits.aiAccess ? "Tu plan no incluye IA: cambia a Negocio o Pro para usar bots y calificadores" : `1 crédito = 1 respuesta o análisis de IA. ${trialing ? poolHint("ejecutivos") : poolHint("créditos")}${
          org.aiCreditsBonus > 0 ? `, más ${org.aiCreditsBonus.toLocaleString("es-MX")} créditos extra de este periodo` : ""
        }`,
        used: org.aiCreditsUsed,
        max: finite(aiCreditLimit(org)),
      },
    ],
  };
  return (
    <Suspense>
      <PlanView data={data} />
    </Suspense>
  );
}
