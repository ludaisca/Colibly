"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, CreditCard, ExternalLink, X } from "lucide-react";
import type { OrganizationStatus, PlanId } from "@prisma/client";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionHeader } from "@/app/components/ui/section-header";
import { Banner } from "@/app/components/ui/banner";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Progress } from "@/app/components/ui/progress";
import { useToast } from "@/app/components/ui/toast";
import { cn } from "@/app/components/ui/cn";
import { PLAN_LIST, PLANS, TRIAL_DAYS, type Plan } from "@/lib/billing/plans";
import type { AccessMode } from "@/lib/billing/state";

export interface PlanViewData {
  plan: PlanId;
  status: OrganizationStatus;
  isInternal: boolean;
  access: AccessMode;
  trialEndsAt: string | null;
  graceEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  hasSubscription: boolean;
  hasCustomer: boolean;
  stripeConfigured: boolean;
  chargeDeferredToTrialEnd: boolean;
  usage: Array<{ key: string; label: string; hint: string | null; used: number; max: number | null }>;
}

const STATUS_BADGE: Record<OrganizationStatus, { label: string; tone: "success" | "warning" | "danger" | "info" | "neutral" }> = {
  TRIALING: { label: "En prueba", tone: "info" },
  ACTIVE: { label: "Activo", tone: "success" },
  PAST_DUE: { label: "Pago pendiente", tone: "warning" },
  READ_ONLY: { label: "Solo lectura", tone: "danger" },
  CANCELED: { label: "Cancelado", tone: "danger" },
  SUSPENDED: { label: "Suspendido", tone: "danger" },
};

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" }) : "";
}

function statusLine(d: PlanViewData): string {
  if (d.isInternal) return "Cuenta interna: sin cobro ni límites.";
  if (d.status === "TRIALING") {
    if (d.access !== "full") return "Tu prueba terminó. Elige un plan para reactivar tu cuenta.";
    return `Prueba gratis de ${TRIAL_DAYS} días con todo el plan Pro, hasta el ${formatDate(d.trialEndsAt)}.`;
  }
  if (d.status === "ACTIVE") {
    if (d.cancelAtPeriodEnd) return `Cancelado: sigue activo hasta el ${formatDate(d.currentPeriodEnd)}.`;
    return d.currentPeriodEnd ? `Se renueva el ${formatDate(d.currentPeriodEnd)}.` : "Suscripción activa.";
  }
  if (d.status === "PAST_DUE") {
    return d.access === "full"
      ? `No pudimos cobrar tu último pago. Actualiza tu tarjeta antes del ${formatDate(d.graceEndsAt)} para no pasar a solo lectura.`
      : "No pudimos cobrar tu suscripción y tu cuenta está en solo lectura.";
  }
  if (d.status === "READ_ONLY") return "Tu cuenta está en solo lectura: ves tus datos, pero no se envían mensajes ni corren bots.";
  if (d.status === "CANCELED") return "Tu suscripción terminó. Conservamos tus datos 60 días: vuelve a suscribirte para reactivar todo.";
  return "Tu cuenta está suspendida. Escríbenos para resolverlo.";
}

function features(plan: Plan): Array<{ text: string; included: boolean }> {
  const l = plan.limits;
  const n = (v: number) => (Number.isFinite(v) ? v.toLocaleString("es-MX") : "Ilimitadas");
  return [
    { text: `${l.users} usuarios`, included: true },
    { text: l.channels === 1 ? "1 canal (WhatsApp, Telegram, Messenger o Instagram)" : `${l.channels} canales`, included: true },
    { text: "Widget de chat para tu web", included: true },
    { text: `${n(l.contacts)} contactos`, included: true },
    { text: `${n(l.aiCreditsPerMonth)} créditos de IA al mes`, included: true },
    { text: Number.isFinite(l.activeAutomations) ? `${l.activeAutomations} automatizaciones activas` : "Automatizaciones ilimitadas", included: true },
    { text: "API y webhooks", included: l.apiAccess },
  ];
}

export function PlanView({ data }: { data: PlanViewData }) {
  const { error: toastError } = useToast();
  const checkout = useSearchParams().get("checkout");
  const [busy, setBusy] = useState<string | null>(null);

  async function go(endpoint: "checkout" | "portal", plan?: PlanId) {
    setBusy(plan ?? endpoint);
    try {
      const res = await fetch(`/api/billing/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(plan ? { plan } : {}),
      });
      const body = await res.json();
      if (!res.ok || !body.url) throw new Error(body.error || "No se pudo abrir la página de pago");
      window.location.assign(body.url);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "No se pudo abrir la página de pago");
      setBusy(null);
    }
  }

  const badge = STATUS_BADGE[data.status];
  const canCheckout = data.stripeConfigured && !data.isInternal && !data.hasSubscription;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <PageHeader
        title="Plan y facturación"
        description="Tu plan, el consumo del mes y tus pagos."
        actions={
          data.hasCustomer && data.stripeConfigured ? (
            <Button size="sm" variant="secondary" icon={ExternalLink} loading={busy === "portal"} onClick={() => go("portal")}>
              Administrar facturación
            </Button>
          ) : undefined
        }
      />

      {checkout === "ok" && (
        <Banner tone="success">¡Gracias! Estamos confirmando tu pago con Stripe; tu plan se actualiza en unos segundos.</Banner>
      )}
      {checkout === "cancelado" && <Banner tone="neutral">No se hizo ningún cargo. Puedes elegir un plan cuando quieras.</Banner>}
      {!data.stripeConfigured && !data.isInternal && (
        <Banner tone="info">
          {data.access === "full"
            ? "Los pagos en línea se habilitarán muy pronto. Mientras tanto, tu cuenta sigue funcionando."
            : "Los pagos en línea se habilitarán muy pronto. Escríbenos y reactivamos tu cuenta."}
        </Banner>
      )}

      <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-display text-xl font-semibold">Plan {PLANS[data.plan].name}</p>
          {!data.isInternal && <Badge tone={badge.tone}>{badge.label}</Badge>}
        </div>
        <p className={cn("mt-2 text-sm", data.access === "full" ? "text-muted" : "text-danger")}>{statusLine(data)}</p>
      </section>

      <section className="space-y-4">
        <SectionHeader eyebrow="Consumo" title="Uso de tu plan" />
        <div className="grid gap-4 sm:grid-cols-2">
          {data.usage.map((u) => {
            const pct = u.max ? Math.round((u.used / u.max) * 100) : 0;
            const tone = u.max && pct >= 100 ? "danger" : u.max && pct >= 80 ? "warning" : "accent";
            return (
              <div key={u.key} className="rounded-xl border border-border bg-surface p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-medium">{u.label}</p>
                  <p className="text-sm tabular-nums text-muted">
                    <span className="font-semibold text-foreground">{u.used.toLocaleString("es-MX")}</span>
                    {u.max !== null ? ` / ${u.max.toLocaleString("es-MX")}` : " · sin límite"}
                  </p>
                </div>
                {u.max !== null && <Progress value={pct} tone={tone} className="mt-3" />}
                {u.hint && <p className="mt-2 text-xs text-muted-darker">{u.hint}</p>}
              </div>
            );
          })}
        </div>
      </section>

      {!data.isInternal && (
        <section className="space-y-4">
          <SectionHeader eyebrow="Planes" title={data.hasSubscription ? "Cambiar de plan" : "Elige tu plan"} />
          {data.hasSubscription && (
            <p className="text-sm text-muted">Para cambiar de plan, de tarjeta o cancelar, usa “Administrar facturación”.</p>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            {PLAN_LIST.map((plan) => {
              const current = data.plan === plan.id && (data.hasSubscription || data.status === "TRIALING");
              return (
                <div
                  key={plan.id}
                  className={cn("flex flex-col rounded-2xl border bg-surface p-5 shadow-sm", current ? "border-accent" : "border-border")}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-display text-lg font-semibold">{plan.name}</p>
                    {current && <Badge tone="accent" size="sm">{data.status === "TRIALING" ? "En prueba" : "Tu plan"}</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-muted">{plan.tagline}</p>
                  <p className="mt-4">
                    <span className="font-display text-hero leading-none tabular-nums">${plan.priceUsd}</span>
                    <span className="text-sm text-muted"> USD / mes</span>
                  </p>
                  <ul className="mt-4 flex-1 space-y-2 text-sm">
                    {features(plan).map((f) => (
                      <li key={f.text} className={cn("flex items-start gap-2", !f.included && "text-muted-darker line-through")}>
                        {f.included ? <Check size={16} className="mt-0.5 shrink-0 text-accent" /> : <X size={16} className="mt-0.5 shrink-0" />}
                        {f.text}
                      </li>
                    ))}
                  </ul>
                  {canCheckout && (
                    <Button className="mt-5" fullWidth icon={CreditCard} loading={busy === plan.id} disabled={!!busy} onClick={() => go("checkout", plan.id)}>
                      Elegir {plan.name}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
          {canCheckout && data.chargeDeferredToTrialEnd && (
            <p className="text-xs text-muted-darker">
              Si eliges un plan durante la prueba, el primer cobro se hace al terminar la prueba. Pagos seguros con Stripe.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
