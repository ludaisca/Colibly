"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ExternalLink, Minus, Plus, X } from "lucide-react";
import { StripeButtonIcon, StripeIcon } from "@/app/components/ui/brand-marks";
import type { OrganizationStatus, PlanId } from "@prisma/client";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionHeader } from "@/app/components/ui/section-header";
import { Banner } from "@/app/components/ui/banner";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Progress } from "@/app/components/ui/progress";
import { useToast } from "@/app/components/ui/toast";
import { cn } from "@/app/components/ui/cn";
import {
  formatMxn,
  maxSeatsFor,
  MIN_SEATS,
  monthlyTotalMxn,
  PLAN_LIST,
  PLANS,
  PRICE_TAX_NOTE,
  PRICE_UNIT,
  RETENTION_DAYS_AFTER_CANCEL,
  RETENTION_DAYS_AFTER_TRIAL,
  TRIAL_DAYS,
  TRIAL_MAX_SEATS,
  TRIAL_POOL_TEXT,
} from "@/lib/billing/plans";
import { COEXISTENCE_PITCH, planFeatures, PRICING_FOOTNOTE } from "@/lib/billing/plan-features";
import { planChangeImpact, type AccessMode } from "@/lib/billing/state";
import { DataSection } from "./_datos";
import { LicensesSection, type LicensesViewData } from "./_licencias";
import { OrgStatusBadge } from "@/app/components/billing/org-status-badge";
import { formatInZone } from "@/lib/format/dates";

export interface PlanViewData {
  organizationName: string;
  isOwner: boolean;
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
  seatsUsed: number;
  apiKeys: number;
  webhooks: number;
  webchat: number;
  seatsPaid: number | null;
  /** null en organizaciones internas. "legacy": conserva el catálogo anterior. */
  licenses: LicensesViewData | null;
  usage: Array<{ key: string; label: string; hint: string | null; used: number; max: number | null }>;
}

function formatDate(iso: string | null): string {
  return formatInZone(iso, { day: "numeric", month: "long", year: "numeric" });
}

// "3 licencias asignadas: 2 Pro · 1 Básico" (personas e invitaciones) y lo que se paga al mes.
function licenseSummary(l: LicensesViewData): string {
  const order = ["PRO", "BUSINESS", "ESSENTIAL"] as const;
  const people = order.reduce((n, p) => n + l.assigned[p], 0);
  const parts = order.filter((p) => l.assigned[p] > 0).map((p) => `${l.assigned[p]} ${PLANS[p].name}`);
  const who = `${people} ${people === 1 ? "licencia asignada" : "licencias asignadas"}${parts.length ? `: ${parts.join(" · ")}` : ""}`;
  if (!l.hasSubscription) return who;
  const paid = order.reduce((n, p) => n + l.purchased[p] * PLANS[p].pricePerSeatMxn, 0);
  return `${who} · ${formatMxn(paid)} MXN al mes`;
}

function statusLine(d: PlanViewData): string {
  if (d.isInternal) return "Cuenta interna: sin cobro ni límites.";
  if (d.status === "TRIALING" && d.licenses?.mode === "license") {
    if (d.access !== "full") return `Tu prueba terminó. Contrata licencias para reactivar tu cuenta; sin ellas, tus datos se eliminan ${RETENTION_DAYS_AFTER_TRIAL} días después de terminar la prueba.`;
    return `Prueba gratis de ${TRIAL_DAYS} días hasta el ${formatDate(d.trialEndsAt)}: hasta ${TRIAL_MAX_SEATS} personas con cualquier licencia y 500 créditos de IA cada una. Si no contratas, ese día tu cuenta pasa a solo lectura.`;
  }
  if (d.status === "TRIALING") {
    if (d.access !== "full") return `Tu prueba terminó. Elige un plan para reactivar tu cuenta; sin plan, tus datos se eliminan ${RETENTION_DAYS_AFTER_TRIAL} días después de terminar la prueba.`;
    return `Prueba gratis de ${TRIAL_DAYS} días con el plan Pro (hasta ${TRIAL_MAX_SEATS} usuarios, con ${TRIAL_POOL_TEXT}), hasta el ${formatDate(d.trialEndsAt)}. Si no eliges un plan, ese día tu cuenta pasa a solo lectura.`;
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
  if (d.status === "READ_ONLY") {
    return d.hasSubscription
      ? "Tu cuenta está en solo lectura: ves tus datos, pero no se envían mensajes ni corren bots."
      : `Tu prueba terminó y tu cuenta está en solo lectura. Elige un plan para reactivarla; sin plan, tus datos se eliminan ${RETENTION_DAYS_AFTER_TRIAL} días después de terminar la prueba.`;
  }
  if (d.status === "CANCELED") return `Tu suscripción terminó. Conservamos tus datos ${RETENTION_DAYS_AFTER_CANCEL} días: vuelve a suscribirte para reactivar todo.`;
  return "Tu cuenta está suspendida. Escríbenos para resolverlo.";
}

export function PlanView({ data }: { data: PlanViewData }) {
  const { error: toastError, success } = useToast();
  const router = useRouter();
  const checkout = useSearchParams().get("checkout");
  const [busy, setBusy] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<PlanId>(data.plan);
  // Con suscripción parte de lo pagado; en prueba, de lo ocupado (el tope de la prueba no se paga).
  const [seats, setSeats] = useState(() => Math.max(data.seatsUsed, (data.hasSubscription ? data.seatsPaid : null) ?? MIN_SEATS, MIN_SEATS));
  const [pendingConfirm, setPendingConfirm] = useState<{ warnings: string[]; blockers: string[] } | null>(null);
  // Subida que Stripe no pudo cobrar: el cambio espera a que se pague la factura.
  const [paymentPending, setPaymentPending] = useState<{ message: string; invoiceUrl: string | null } | null>(null);

  const plan = PLANS[selectedPlan];
  const minSeats = Math.max(data.seatsUsed, MIN_SEATS);
  const total = monthlyTotalMxn(plan, seats);

  const preview = useMemo(() => {
    // Mismo cálculo que la API (que lo vuelve a evaluar al guardar).
    const usage = {
      seats: data.seatsUsed,
      whatsapp: data.usage.find((u) => u.key === "whatsapp")?.used ?? 0,
      telegram: data.usage.find((u) => u.key === "telegram")?.used ?? 0,
      messenger: data.usage.find((u) => u.key === "messenger")?.used ?? 0,
      instagram: data.usage.find((u) => u.key === "instagram")?.used ?? 0,
      webchat: data.webchat,
      contacts: data.usage.find((u) => u.key === "contacts")?.used ?? 0,
      activeLeads: data.usage.find((u) => u.key === "leads")?.used ?? 0,
      activeAutomations: data.usage.find((u) => u.key === "automations")?.used ?? 0,
      funnels: data.usage.find((u) => u.key === "funnels")?.used ?? 0,
      customFields: data.usage.find((u) => u.key === "fields")?.used ?? 0,
      aiAgents: data.usage.find((u) => u.key === "agents")?.used ?? 0,
      apiKeys: data.apiKeys,
      webhooks: data.webhooks,
    };
    return planChangeImpact(selectedPlan, seats, usage);
  }, [data, selectedPlan, seats]);

  // Tope del plan elegido.
  const planMaxSeats = maxSeatsFor(plan);
  function clampSeats(n: number) {
    return Math.min(planMaxSeats, Math.max(minSeats, n));
  }

  async function submit(confirm: boolean) {
    setBusy(confirm ? "confirm" : "save");
    setPendingConfirm(null);
    setPaymentPending(null);
    try {
      const endpoint = data.hasSubscription ? "/api/billing/subscription" : "/api/billing/checkout";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: selectedPlan, seats, confirm }),
      });
      const body = await res.json();
      if (res.status === 409 && body.code === "confirm_required") {
        setPendingConfirm(body.impact ?? { warnings: [body.error], blockers: [] });
        setBusy(null);
        return;
      }
      if (res.status === 402 && body.code === "payment_pending") {
        setPaymentPending({ message: body.error, invoiceUrl: body.invoiceUrl ?? null });
        router.refresh();
        setBusy(null);
        return;
      }
      if (!res.ok) throw new Error(body.error || "No se pudo actualizar el plan");
      if (body.url) {
        window.location.assign(body.url);
        return;
      }
      success("Plan actualizado. Los cambios se reflejan en unos segundos.");
      router.refresh();
      setBusy(null);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "No se pudo actualizar el plan");
      setBusy(null);
    }
  }

  async function goPortal() {
    setBusy("portal");
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const body = await res.json();
      if (!res.ok || !body.url) throw new Error(body.error || "No se pudo abrir la facturación");
      window.location.assign(body.url);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "No se pudo abrir la facturación");
      setBusy(null);
    }
  }

  // Plan y asientos se pueden explorar siempre (calculadora); pagar requiere Stripe.
  const canEdit = !data.isInternal;
  const canPay = data.stripeConfigured;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Plan y facturación"
        description="Asientos (ejecutivos), consumo del mes y pagos."
        actions={
          data.hasCustomer && data.stripeConfigured ? (
            <Button size="sm" variant="secondary" icon={ExternalLink} loading={busy === "portal"} onClick={goPortal}>
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

      <section className="rounded-xl border border-border bg-surface p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-display text-xl font-semibold">{data.licenses?.mode === "license" ? "Licencias por persona" : `Plan ${PLANS[data.plan].name}`}</p>
          {!data.isInternal && <OrgStatusBadge status={data.status} />}
        </div>
        <p className={cn("mt-2 text-sm", data.access === "full" ? "text-muted" : "text-danger")}>{statusLine(data)}</p>
        {data.licenses?.mode === "license" && (
          <p className="mt-3 text-sm text-muted-strong">
            {licenseSummary(data.licenses)}
            {PRICE_TAX_NOTE ? ` · ${PRICE_TAX_NOTE}` : null}
          </p>
        )}
        {!data.isInternal && data.licenses?.mode !== "license" && (
          <p className="mt-3 text-sm text-muted-strong">
            {data.seatsPaid === null
              ? `${data.seatsUsed.toLocaleString("es-MX")} ${data.seatsUsed === 1 ? "ejecutivo" : "ejecutivos"} ocupados`
              : data.status === "TRIALING"
                ? `${data.seatsUsed.toLocaleString("es-MX")} de ${data.seatsPaid.toLocaleString("es-MX")} ejecutivos de la prueba`
                : `${data.seatsUsed.toLocaleString("es-MX")} de ${data.seatsPaid.toLocaleString("es-MX")} asientos ocupados`}
            {" · "}
            {formatMxn(PLANS[data.plan].pricePerSeatMxn)} {PRICE_UNIT}
            {data.seatsPaid !== null && data.hasSubscription && (
              <>
                {" · "}
                <span className="font-medium text-foreground">{formatMxn(monthlyTotalMxn(PLANS[data.plan], data.seatsPaid))} MXN al mes</span>
              </>
            )}
            {PRICE_TAX_NOTE ? ` · ${PRICE_TAX_NOTE}` : null}
          </p>
        )}
        <p className="mt-2 text-xs text-muted-darker">{COEXISTENCE_PITCH}</p>
      </section>

      <section className="space-y-4">
        <SectionHeader eyebrow="Consumo" title="Uso de tu plan" />
        <div className="grid gap-3 sm:grid-cols-2">
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

      {data.licenses && (
        <LicensesSection data={data.licenses} stripeConfigured={data.stripeConfigured} chargeDeferredToTrialEnd={data.chargeDeferredToTrialEnd} onPortal={goPortal} />
      )}

      {!data.isInternal && data.licenses?.mode === "legacy" && (
        <section id="asientos" className="space-y-4 scroll-mt-24">
          <SectionHeader eyebrow="Planes" title={data.hasSubscription ? "Cambiar plan o asientos" : "Elige tu plan"} />
          <p className="text-sm text-muted">
            Se cobra por usuario: cada persona de tu equipo (incluido el dueño) ocupa un asiento. Contactos, leads activos y créditos de IA se suman por usuario. {PRICING_FOOTNOTE}
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            {PLAN_LIST.map((p) => {
              const current = data.plan === p.id && (data.hasSubscription || data.status === "TRIALING");
              const selected = selectedPlan === p.id;
              return (
                <button
                  type="button"
                  key={p.id}
                  disabled={!canEdit}
                  onClick={() => canEdit && setSelectedPlan(p.id)}
                  className={cn(
                    "flex flex-col rounded-xl border bg-surface p-4 text-left transition-colors",
                    selected ? "border-foreground ring-1 ring-foreground" : "border-border",
                    canEdit ? "hover:border-muted" : "opacity-90"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-display text-lg font-semibold">{p.name}</p>
                    <span className="flex gap-1">
                      {p.badge && <Badge tone="info" size="sm">{p.badge}</Badge>}
                      {current && <Badge tone="accent" size="sm">{data.status === "TRIALING" ? "En prueba" : "Tu plan"}</Badge>}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted">{p.tagline}</p>
                  <p className="mt-4">
                    <span className="font-display text-3xl leading-none tabular-nums">{formatMxn(p.pricePerSeatMxn)}</span>
                    <span className="text-sm text-muted"> {PRICE_UNIT}</span>
                  </p>
                  <ul className="mt-4 flex-1 space-y-2 text-sm">
                    {planFeatures(p).map((f) => (
                      <li key={f.text} className={cn("flex items-start gap-2", !f.included && "text-muted-darker line-through")}>
                        {f.included ? <Check size={16} className="mt-0.5 shrink-0 text-accent-ink" /> : <X size={16} className="mt-0.5 shrink-0" />}
                        {f.text}
                      </li>
                    ))}
                  </ul>
                </button>
              );
            })}
          </div>

          {canEdit && (
            <div className="rounded-xl border border-border bg-surface p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Ejecutivos (asientos)</p>
                  <p className="text-xs text-muted-darker">Mínimo {minSeats}: no puedes pagar menos de los que ya ocupas.</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="secondary" icon={Minus} disabled={!!busy || seats <= minSeats} onClick={() => setSeats((n) => clampSeats(n - 1))} aria-label="Quitar asiento" />
                  <input
                    type="number"
                    min={minSeats}
                    max={planMaxSeats}
                    value={seats}
                    onChange={(e) => setSeats(clampSeats(Number(e.target.value) || minSeats))}
                    className="w-16 rounded-lg border border-border bg-background px-2 py-1.5 text-center text-sm tabular-nums"
                    aria-label="Número de asientos"
                  />
                  <Button size="sm" variant="secondary" icon={Plus} disabled={!!busy || seats >= planMaxSeats} onClick={() => setSeats((n) => clampSeats(n + 1))} aria-label="Agregar asiento" />
                </div>
              </div>
              <p className="text-sm">
                Total mensual: <span className="font-display text-xl font-semibold tabular-nums">{formatMxn(total)}</span>
                <span className="text-muted"> MXN / mes</span>
                {PRICE_TAX_NOTE ? <span className="text-muted"> · {PRICE_TAX_NOTE}</span> : null}
              </p>
              {preview.blockers.length > 0 && (
                <Banner tone="danger">
                  <ul className="list-disc space-y-1 pl-4 text-sm">
                    {preview.blockers.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                </Banner>
              )}
              {preview.warnings.length > 0 && !pendingConfirm && (
                <Banner tone="warning">
                  <p className="text-sm font-medium">Antes de continuar, ten en cuenta:</p>
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-sm">
                    {preview.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </Banner>
              )}
              {pendingConfirm && (
                <Banner tone="warning">
                  <p className="text-sm font-medium">Confirma el cambio:</p>
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-sm">
                    {pendingConfirm.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" loading={busy === "confirm"} onClick={() => submit(true)}>Confirmar y continuar</Button>
                    <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => setPendingConfirm(null)}>Cancelar</Button>
                  </div>
                </Banner>
              )}
              {paymentPending && (
                <Banner tone="danger">
                  <p className="text-sm">{paymentPending.message}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {paymentPending.invoiceUrl ? (
                      <Button size="sm" href={paymentPending.invoiceUrl} external icon={ExternalLink}>Pagar la factura</Button>
                    ) : (
                      <Button size="sm" loading={busy === "portal"} disabled={!!busy} onClick={goPortal}>Administrar facturación</Button>
                    )}
                  </div>
                </Banner>
              )}
              {!pendingConfirm && (
                <Button
                  icon={StripeButtonIcon}
                  loading={busy === "save"}
                  disabled={!canPay || !!busy || preview.blockers.length > 0}
                  onClick={() => submit(false)}
                >
                  {data.hasSubscription ? "Actualizar plan" : `Suscribirme a ${plan.name}`}
                </Button>
              )}
              {!canPay && <p className="text-xs text-muted-darker">Los pagos en línea se habilitarán muy pronto; mientras tanto puedes calcular tu total.</p>}
              {canPay && !data.hasSubscription && data.chargeDeferredToTrialEnd && (
                <p className="flex items-center gap-1.5 text-xs text-muted-darker">
                  <StripeIcon size={14} className="shrink-0" />
                  Si eliges un plan durante la prueba, el primer cobro se hace al terminar la prueba. Pagos seguros con Stripe.
                </p>
              )}
              {data.hasSubscription && (
                <p className="flex items-center gap-1.5 text-xs text-muted-darker">
                  <StripeIcon size={14} className="shrink-0" />
                  Al agregar o quitar asientos Stripe prorratea el cambio. La tarjeta y las facturas se administran en “Administrar facturación”.
                </p>
              )}
            </div>
          )}
        </section>
      )}

      <DataSection organizationName={data.organizationName} isOwner={data.isOwner} isInternal={data.isInternal} />
    </div>
  );
}
