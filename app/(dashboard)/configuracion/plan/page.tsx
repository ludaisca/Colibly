import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireOrgId } from "@/lib/tenancy";
import { getOrgBilling, getOrgUsage, invalidateOrgBilling } from "@/lib/billing/gates";
import { accessMode, planLimits } from "@/lib/billing/state";
import { isStripeConfigured } from "@/lib/billing/stripe";
import { PlanView, type PlanViewData } from "./_view";

// Plan y facturación (solo admin): estado, consumo contra límites y pago.
export default async function PlanPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (session.user.role !== "admin") redirect("/configuracion");

  const organizationId = await requireOrgId(session.user.id);
  // Recién vuelto de Stripe el estado puede haber cambiado por el webhook.
  invalidateOrgBilling(organizationId);
  const [org, usage] = await Promise.all([getOrgBilling(organizationId), getOrgUsage(organizationId)]);
  if (!org) redirect("/configuracion");

  const now = new Date();
  const limits = planLimits(org);
  const finite = (n: number) => (Number.isFinite(n) ? n : null);

  const data: PlanViewData = {
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
    stripeConfigured: isStripeConfigured(),
    // Stripe solo difiere el primer cobro si quedan más de 48 h de prueba.
    chargeDeferredToTrialEnd: org.status === "TRIALING" && !!org.trialEndsAt && org.trialEndsAt.getTime() - now.getTime() > 49 * 60 * 60 * 1000,
    usage: [
      { key: "users", label: "Usuarios", hint: "Incluye invitaciones pendientes", used: usage.users, max: finite(limits.users) },
      { key: "channels", label: "Canales conectados", hint: "WhatsApp, Telegram, Messenger e Instagram. El widget web no cuenta", used: usage.channels, max: finite(limits.channels) },
      { key: "contacts", label: "Contactos", hint: null, used: usage.contacts, max: finite(limits.contacts) },
      { key: "automations", label: "Automatizaciones activas", hint: null, used: usage.activeAutomations, max: finite(limits.activeAutomations) },
      { key: "ai", label: "Créditos de IA este mes", hint: "1 crédito = 1 respuesta o análisis de IA", used: org.aiCreditsUsed, max: finite(limits.aiCreditsPerMonth) },
    ],
  };
  return (
    <Suspense>
      <PlanView data={data} />
    </Suspense>
  );
}
