"use client";

import { formatInZone } from "@/lib/format/dates";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ExternalLink, Minus, Plus, Users } from "lucide-react";
import type { PlanId } from "@prisma/client";
import { StripeButtonIcon, StripeIcon } from "@/app/components/ui/brand-marks";
import { SectionHeader } from "@/app/components/ui/section-header";
import { Banner } from "@/app/components/ui/banner";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Table } from "@/app/components/ui/table";
import { useToast } from "@/app/components/ui/toast";
import { cn } from "@/app/components/ui/cn";
import {
  LICENSE_FEATURE_NAMES,
  LICENSE_ORDER,
  LICENSES,
  licenseAddedFeatures,
  licenseTargetBlockers,
  monthlyTotalForLicenses,
  totalLicenses,
  TRIAL_AI_CREDITS_PER_USER,
  TRIAL_MAX_USERS,
  type LicenseCounts,
} from "@/lib/billing/licenses";
import { formatMxn, MAX_SEATS, PLANS, PRICE_TAX_NOTE } from "@/lib/billing/plans";

export interface LicensesViewData {
  mode: "license" | "legacy";
  legacyUntil: string | null;
  trialing: boolean;
  hasSubscription: boolean;
  purchased: LicenseCounts;
  assigned: LicenseCounts;
  people: Array<{ id: string; name: string; license: PlanId; aiUsed: number; aiMax: number | null; channels: number }>;
}

const price = (id: PlanId) => PLANS[id].pricePerSeatMxn;
const n = (v: number) => v.toLocaleString("es-MX");

// Licencias por usuario (docs/PLAN_LICENCIAS_2026-11-04.md): cuántas de cada
// plan se contratan (una línea de Stripe por plan) y los créditos de IA de
// cada persona. Comprar: POST /api/billing/checkout; cambiar la suscripción
// vigente (o pasarse desde el catálogo anterior): POST /api/billing/licenses.
export function LicensesSection({
  data,
  stripeConfigured,
  chargeDeferredToTrialEnd,
  onPortal,
}: {
  data: LicensesViewData;
  stripeConfigured: boolean;
  chargeDeferredToTrialEnd: boolean;
  onPortal: () => void;
}) {
  const { error: toastError, success } = useToast();
  const router = useRouter();
  const initial = useMemo<LicenseCounts>(() => {
    // Con suscripción parte de lo contratado; en prueba, de lo asignado.
    const base = data.hasSubscription ? data.purchased : data.assigned;
    const out = { ...base };
    for (const id of LICENSE_ORDER) out[id] = Math.max(out[id], data.assigned[id]);
    if (totalLicenses(out) === 0) out.PRO = 1;
    return out;
  }, [data]);
  const [counts, setCounts] = useState<LicenseCounts>(initial);
  const [busy, setBusy] = useState(false);
  const [warnings, setWarnings] = useState<string[] | null>(null);
  const [pending, setPending] = useState<{ message: string; invoiceUrl: string | null } | null>(null);

  const total = monthlyTotalForLicenses(counts, price);
  const blockers = licenseTargetBlockers(counts, data.assigned, (id) => PLANS[id].name);
  const unchanged = data.hasSubscription && data.mode === "license" && LICENSE_ORDER.every((id) => counts[id] === data.purchased[id]);

  function step(id: PlanId, delta: number) {
    setWarnings(null);
    setCounts((c) => {
      const next = { ...c, [id]: Math.max(0, c[id] + delta) };
      return totalLicenses(next) > MAX_SEATS ? c : next;
    });
  }

  async function submit(confirm: boolean) {
    setBusy(true);
    setPending(null);
    try {
      const endpoint = data.hasSubscription ? "/api/billing/licenses" : "/api/billing/checkout";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ licenses: counts, confirm }),
      });
      const body = await res.json();
      if (res.status === 409 && body.code === "confirm_required") {
        setWarnings(body.impact?.warnings ?? [body.error]);
        return;
      }
      if (res.status === 402 && body.code === "payment_pending") {
        setPending({ message: body.error, invoiceUrl: body.invoiceUrl ?? null });
        router.refresh();
        return;
      }
      if (!res.ok) throw new Error(body.error || "No se pudieron actualizar tus licencias");
      if (body.url) {
        window.location.assign(body.url);
        return;
      }
      success(data.mode === "legacy" ? "Listo: tu organización ya usa licencias por persona." : "Licencias actualizadas. Los cambios se reflejan en unos segundos.");
      setWarnings(null);
      router.refresh();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "No se pudieron actualizar tus licencias");
    } finally {
      setBusy(false);
    }
  }

  const trialFree = data.trialing && !data.hasSubscription;

  return (
    <section id="licencias" className="space-y-4 scroll-mt-24">
      <SectionHeader
        eyebrow="Licencias"
        title={data.mode === "legacy" ? "Pasar a licencias por persona" : data.hasSubscription ? "Tus licencias" : "Contrata tus licencias"}
      />
      <p className="text-sm text-muted">
        Cada persona de tu equipo (dueño y admins incluidos) paga una licencia, y puedes mezclar planes. Cada licencia incluye un canal de cada tipo
        (WhatsApp, Instagram, Messenger, Telegram y chat web); los canales funcionan con la licencia de su dueño. Contactos y leads se suman en la
        organización; los créditos de IA son de cada persona.
      </p>
      {data.mode === "legacy" && (
        <Banner tone="info">
          Tu organización conserva el plan anterior
          {data.legacyUntil ? ` hasta el ${formatInZone(data.legacyUntil, { day: "numeric", month: "long", year: "numeric" })}` : ""}.
          Puedes pasarte antes: tus personas conservan la licencia que tienen asignada y Stripe prorratea la diferencia.
        </Banner>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        {LICENSE_ORDER.map((id) => {
          const tier = LICENSES[id];
          const added = licenseAddedFeatures(id);
          const below = LICENSE_ORDER[LICENSE_ORDER.indexOf(id) - 1];
          return (
            <div key={id} className={cn("flex flex-col rounded-xl border bg-surface p-4 shadow-sm", counts[id] > 0 ? "border-accent-strong" : "border-border")}>
              <div className="flex items-center justify-between gap-2">
                <p className="font-display text-lg font-semibold">{PLANS[id].name}</p>
                {id === "BUSINESS" && <Badge tone="info" size="sm">Recomendado</Badge>}
              </div>
              <p className="mt-2">
                <span className="font-display text-3xl leading-none tabular-nums">{formatMxn(price(id))}</span>
                <span className="text-sm text-muted"> por persona al mes</span>
              </p>
              <ul className="mt-4 flex-1 space-y-2 text-sm">
                <li className="text-muted-strong">{below ? `Todo lo de ${PLANS[below].name}, más:` : "Bandeja compartida, CRM, embudos, tareas, citas y respuestas rápidas"}</li>
                {added.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check size={16} className="mt-0.5 shrink-0 text-accent-ink" />
                    {LICENSE_FEATURE_NAMES[f]}
                  </li>
                ))}
                <li className="flex items-start gap-2">
                  <Check size={16} className="mt-0.5 shrink-0 text-accent-ink" />
                  {n(tier.contacts)} contactos y {n(tier.activeLeads)} leads activos
                </li>
                <li className="flex items-start gap-2">
                  <Check size={16} className="mt-0.5 shrink-0 text-accent-ink" />
                  {tier.aiCreditsPerMonth > 0 ? `${n(tier.aiCreditsPerMonth)} créditos de IA al mes` : "Sin créditos de IA"}
                </li>
              </ul>
              <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-3">
                <p className="text-xs text-muted-darker">
                  {data.assigned[id] > 0 ? `${data.assigned[id]} asignada${data.assigned[id] === 1 ? "" : "s"}` : "Ninguna asignada"}
                </p>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="secondary" icon={Minus} disabled={busy || counts[id] <= 0} onClick={() => step(id, -1)} aria-label={`Quitar una licencia ${PLANS[id].name}`} />
                  <span className="w-8 text-center text-sm font-semibold tabular-nums">{counts[id]}</span>
                  <Button size="sm" variant="secondary" icon={Plus} disabled={busy} onClick={() => step(id, 1)} aria-label={`Agregar una licencia ${PLANS[id].name}`} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-4 rounded-xl border border-border bg-surface p-4">
        <p className="text-sm">
          {n(totalLicenses(counts))} {totalLicenses(counts) === 1 ? "licencia" : "licencias"} · Total mensual:{" "}
          <span className="font-display text-xl font-semibold tabular-nums">{formatMxn(total)}</span>
          <span className="text-muted"> MXN / mes</span>
          {PRICE_TAX_NOTE ? <span className="text-muted"> · {PRICE_TAX_NOTE}</span> : null}
        </p>
        {trialFree && (
          <p className="text-xs text-muted-darker">
            En la prueba gratis tu equipo usa cualquier licencia (hasta {TRIAL_MAX_USERS} personas, {n(TRIAL_AI_CREDITS_PER_USER)} créditos de IA cada una). Al contratar, cada persona necesita una licencia de su plan: cambia la de cada quien en Usuarios antes de pagar.
          </p>
        )}
        {blockers.length > 0 && (
          <Banner tone="danger">
            <ul className="list-disc space-y-1 pl-4 text-sm">
              {blockers.map((b) => (
                <li key={b}>
                  {b} <a href="/usuarios" className="font-medium underline underline-offset-2">Ir a Usuarios</a>
                </li>
              ))}
            </ul>
          </Banner>
        )}
        {warnings && (
          <Banner tone="warning">
            <p className="text-sm font-medium">Confirma el cambio:</p>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-sm">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" loading={busy} onClick={() => submit(true)}>Confirmar y continuar</Button>
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => setWarnings(null)}>Cancelar</Button>
            </div>
          </Banner>
        )}
        {pending && (
          <Banner tone="danger">
            <p className="text-sm">{pending.message}</p>
            <div className="mt-3">
              {pending.invoiceUrl ? (
                <Button size="sm" href={pending.invoiceUrl} external icon={ExternalLink}>Pagar la factura</Button>
              ) : (
                <Button size="sm" onClick={onPortal}>Administrar facturación</Button>
              )}
            </div>
          </Banner>
        )}
        {!warnings && (
          <Button icon={StripeButtonIcon} loading={busy} disabled={!stripeConfigured || busy || blockers.length > 0 || unchanged} onClick={() => submit(false)}>
            {data.mode === "legacy" ? "Pasar a licencias" : data.hasSubscription ? "Actualizar licencias" : "Contratar licencias"}
          </Button>
        )}
        {!stripeConfigured && <p className="text-xs text-muted-darker">Los pagos en línea se habilitarán muy pronto; mientras tanto puedes calcular tu total.</p>}
        {stripeConfigured && !data.hasSubscription && chargeDeferredToTrialEnd && (
          <p className="flex items-center gap-1.5 text-xs text-muted-darker">
            <StripeIcon size={14} className="shrink-0" />
            Si contratas durante la prueba, el primer cobro se hace al terminar la prueba. Pagos seguros con Stripe.
          </p>
        )}
        {data.hasSubscription && (
          <p className="flex items-center gap-1.5 text-xs text-muted-darker">
            <StripeIcon size={14} className="shrink-0" />
            Stripe prorratea: agregar licencias se cobra al momento; quitarlas deja el saldo a favor para la siguiente factura.
          </p>
        )}
      </div>

      {data.mode === "license" && data.people.length > 0 && (
        <div className="space-y-2">
          <SectionHeader eyebrow="Créditos de IA" title="Por persona, este periodo" />
          <Table
            columns={[
              { key: "name", header: "Persona", render: (p: LicensesViewData["people"][number]) => p.name },
              { key: "license", header: "Licencia", render: (p: LicensesViewData["people"][number]) => PLANS[p.license].name },
              { key: "channels", header: "Canales propios", cellClassName: "text-right tabular-nums", headerClassName: "text-right", render: (p: LicensesViewData["people"][number]) => n(p.channels) },
              {
                key: "ai",
                header: "Créditos de IA",
                cellClassName: "text-right tabular-nums",
        headerClassName: "text-right",
                render: (p: LicensesViewData["people"][number]) => (p.aiMax === null ? `${n(p.aiUsed)} · sin tope` : p.aiMax === 0 ? "No incluye" : `${n(p.aiUsed)} / ${n(p.aiMax)}`),
              },
            ]}
            rows={data.people}
            rowKey={(p) => p.id}
            emptyIcon={Users}
            emptyTitle="Sin personas activas"
          />
        </div>
      )}
    </section>
  );
}
