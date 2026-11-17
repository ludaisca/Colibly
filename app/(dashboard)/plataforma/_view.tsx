"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, CalendarPlus, Search, ShieldOff, ShieldCheck } from "lucide-react";
import type { OrganizationStatus, PlanId } from "@prisma/client";
import { PageHeader } from "@/app/components/ui/page-header";
import { KpiStrip } from "@/app/components/ui/kpi-strip";
import { PageContainer } from "@/app/components/ui/page-container";
import { Table, type TableColumn } from "@/app/components/ui/table";
import { Input } from "@/app/components/ui/input";
import { Select } from "@/app/components/ui/select";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
import { Modal } from "@/app/components/ui/modal";
import { Banner } from "@/app/components/ui/banner";
import { FormField } from "@/app/components/ui/form-field";
import { Switch } from "@/app/components/ui/switch";
import { ConfirmDialog } from "@/app/components/ui/confirm-dialog";
import { Pagination } from "@/app/components/ui/pagination";
import { useToast } from "@/app/components/ui/toast";
import { ORG_STATUS_BADGE, OrgStatusBadge } from "@/app/components/billing/org-status-badge";
import { PLANS } from "@/lib/billing/plans";
import { BRAND_NAME } from "@/lib/brand";
import { PlataformaConfiguracion } from "./_configuracion";
import { PlataformaRespaldos } from "./_respaldos";
import { PlataformaOperacion } from "./_operacion";
import { PlataformaSoporte } from "./_soporte";
import { Tabs, useUrlTab } from "@/app/components/ui/tabs";
import { PlataformaActivacion } from "./_activacion";
import { formatInZone } from "@/lib/format/dates";
import { plural } from "@/lib/format/plural";
import { AiMark } from "@/app/components/ui/ai-mark";

const TABS = ["organizaciones", "activacion", "soporte", "configuracion", "respaldos", "operacion"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = { organizaciones: "Organizaciones", activacion: "Activación", soporte: "Soporte", configuracion: "Configuración", respaldos: "Respaldos", operacion: "Operación" };


// "2 Básico · 1 Pro" (las de Stripe); en prueba o sin suscripción, el plan.
function licensesLabel(r: { plan: PlanId; licenses: { ESSENTIAL: number; BUSINESS: number; PRO: number }; legacy: boolean; hasSubscription: boolean }): string {
  const parts = (["PRO", "BUSINESS", "ESSENTIAL"] as const).filter((p) => r.licenses[p] > 0).map((p) => `${r.licenses[p]} ${PLANS[p].name}`);
  const base = r.hasSubscription && parts.length > 0 ? parts.join(" · ") : PLANS[r.plan].name;
  return r.legacy ? `${base} (plan anterior)` : base;
}
export interface PlatformSummary {
  total: number;
  trialing: number;
  paying: number;
  pastDue: number;
  inactive: number;
  suspended: number;
  mrrMxn: number;
  signups7d: number;
}

export interface PlatformOrgRow {
  id: string;
  name: string;
  plan: PlanId;
  status: OrganizationStatus;
  isInternal: boolean;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  canceledAt: string | null;
  createdAt: string;
  aiCreditsUsed: number;
  aiCreditsBonus: number;
  aiCreditsLimit: number | null;
  hasSubscription: boolean;
  ownerName: string | null;
  ownerEmail: string | null;
  ownerVerified: boolean;
  members: number;
  licenses: { ESSENTIAL: number; BUSINESS: number; PRO: number };
  legacy: boolean;
  channels: number;
  channelFlags: { telegram: boolean; messenger: boolean; instagram: boolean; webchat: boolean };
  whatsappCoexistence: boolean;
  whatsappWeb: boolean;
}

const n = (v: number) => v.toLocaleString("es-MX");
const date = (iso: string | null) => formatInZone(iso, { day: "numeric", month: "short", year: "numeric" }) || "—";

// Línea bajo el estado: la fecha que importa para cada uno.
function statusDetail(r: PlatformOrgRow): string | null {
  if (r.isInternal) return "Interna";
  if (r.status === "TRIALING") return `Prueba hasta ${date(r.trialEndsAt)}`;
  if (r.status === "ACTIVE") return r.currentPeriodEnd ? `Renueva ${date(r.currentPeriodEnd)}` : null;
  if (r.status === "CANCELED") return `Cancelada ${date(r.canceledAt)}`;
  return null;
}

export function PlatformView({
  summary,
  rows,
  total,
  page,
  totalPages,
  filters,
}: {
  summary: PlatformSummary;
  rows: PlatformOrgRow[];
  total: number;
  page: number;
  totalPages: number;
  filters: { q: string; status: OrganizationStatus | null };
}) {
  const router = useRouter();
  const [tab, setTab] = useUrlTab<Tab>(TABS, "organizaciones");
  const [q, setQ] = useState(filters.q);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // La fila se toma de las props: tras router.refresh() el modal ve los datos nuevos.
  const selected = rows.find((r) => r.id === selectedId) ?? null;

  function go(next: { q?: string; estado?: string | null; pagina?: number }) {
    const params = new URLSearchParams();
    const query = next.q ?? filters.q;
    const estado = next.estado === undefined ? filters.status : next.estado;
    if (query) params.set("q", query);
    if (estado) params.set("estado", estado);
    if (next.pagina && next.pagina > 1) params.set("pagina", String(next.pagina));
    router.push(`/plataforma${params.size ? `?${params}` : ""}`);
  }

  const columns: TableColumn<PlatformOrgRow>[] = [
    {
      key: "name",
      header: "Organización",
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{r.name}</p>
          <p className="truncate text-xs text-muted">
            {r.ownerEmail ?? "sin dueño"}
            {r.ownerEmail && !r.ownerVerified && " · sin verificar"}
          </p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Estado",
      render: (r) => (
        <div>
          {r.isInternal ? <Badge tone="neutral" size="sm">Interna</Badge> : <OrgStatusBadge status={r.status} size="sm" />}
          {!r.isInternal && statusDetail(r) && <p className="mt-1 text-xs text-muted">{statusDetail(r)}</p>}
        </div>
      ),
    },
    { key: "plan", header: "Licencias", hideBelow: "sm", render: (r) => licensesLabel(r) },
    { key: "team", header: "Usuarios · cuentas", hideBelow: "md", cellClassName: "tabular-nums", render: (r) => `${r.members} · ${r.channels}` },
    {
      key: "ai",
      header: "IA del periodo",
      hideBelow: "md",
      cellClassName: "tabular-nums",
      render: (r) => (r.aiCreditsLimit === null ? `${n(r.aiCreditsUsed)} · sin límite` : `${n(r.aiCreditsUsed)} / ${n(r.aiCreditsLimit)}`),
    },
    { key: "created", header: "Alta", hideBelow: "sm", cellClassName: "tabular-nums", render: (r) => date(r.createdAt) },
  ];

  return (
    <PageContainer width="6xl">
      <PageHeader title="Plataforma" description={`Todas las organizaciones de ${BRAND_NAME}, su cobro y acciones de soporte.`} />

      <Tabs items={TABS.map((id) => ({ id, label: TAB_LABEL[id] }))} value={tab} onChange={setTab} label="Secciones de Plataforma">
      {tab === "configuracion" ? (
        <PlataformaConfiguracion />
      ) : tab === "respaldos" ? (
        <PlataformaRespaldos />
      ) : tab === "operacion" ? (
        <PlataformaOperacion />
      ) : tab === "activacion" ? (
        <PlataformaActivacion />
      ) : tab === "soporte" ? (
        <PlataformaSoporte />
      ) : (
        <PageContainer width="6xl">
          <KpiStrip
            size="compact"
            items={[
              { label: "Ingreso mensual", value: `$${n(summary.mrrMxn)} MXN`, hint: "Suscripciones activas × asientos" },
              { label: "Pagando", value: n(summary.paying), delta: summary.pastDue ? `${n(summary.pastDue)} con pago pendiente` : undefined, deltaTone: "danger" },
              { label: "En prueba", value: n(summary.trialing), delta: `${plural(summary.signups7d, "alta")} en 7 días`, deltaTone: "neutral" },
              {
                label: "Sin actividad",
                value: n(summary.inactive),
                hint: "Solo lectura o canceladas",
                delta: summary.suspended ? `${n(summary.suspended)} suspendidas` : undefined,
                deltaTone: "danger",
              },
            ]}
          />

          <div className="space-y-4">
            <form
              className="flex flex-col gap-2 sm:flex-row"
              onSubmit={(e) => {
                e.preventDefault();
                go({ q: q.trim(), pagina: 1 });
              }}
            >
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Organización o correo" aria-label="Buscar" className="sm:max-w-sm" />
              <Select value={filters.status ?? ""} onChange={(e) => go({ estado: e.target.value || null, pagina: 1 })} aria-label="Estado" className="sm:w-48">
                <option value="">Todos los estados</option>
                {Object.entries(ORG_STATUS_BADGE).map(([value, { label }]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
              <Button type="submit" variant="secondary" icon={Search}>
                Buscar
              </Button>
            </form>

            <p className="text-sm text-muted">{plural(total, "organización", "organizaciones")}</p>
            <Table
              className="rounded-lg border border-border bg-surface p-4"
              columns={columns}
              rows={rows}
              rowKey={(r) => r.id}
              onRowClick={(r) => setSelectedId(r.id)}
              emptyIcon={Building2}
              emptyTitle="Sin organizaciones"
              emptyDescription={filters.q || filters.status ? "Nada coincide con la búsqueda." : "Aún no se registra nadie."}
            />
            {totalPages > 1 && <Pagination currentPage={page} totalPages={totalPages} onPageChange={(p) => go({ pagina: p })} />}
          </div>

          {selected && <OrgModal org={selected} onClose={() => setSelectedId(null)} onChanged={() => router.refresh()} />}
        </PageContainer>
      )}
      </Tabs>
    </PageContainer>
  );
}

function OrgModal({ org, onClose, onChanged }: { org: PlatformOrgRow; onClose: () => void; onChanged: () => void }) {
  const { success } = useToast();
  const [days, setDays] = useState("7");
  const [credits, setCredits] = useState("200");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [confirmSuspend, setConfirmSuspend] = useState(false);

  async function act(body: Record<string, unknown>, done: string) {
    setError("");
    setBusy(String(body.action));
    try {
      const res = await fetch(`/api/plataforma/organizaciones/${org.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo aplicar la acción");
      success(done);
      setConfirmSuspend(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo aplicar la acción");
    } finally {
      setBusy(null);
    }
  }

  const canTrial = !org.isInternal && org.status !== "SUSPENDED" && org.status !== "ACTIVE" && org.status !== "PAST_DUE" && !(org.status === "READ_ONLY" && org.hasSubscription);
  const detail = [
    ["Dueño", org.ownerName ? `${org.ownerName} · ${org.ownerEmail}` : (org.ownerEmail ?? "—")],
    ["Licencias", licensesLabel(org)],
    ["Estado", org.isInternal ? "Interna" : `${ORG_STATUS_BADGE[org.status].label}${statusDetail(org) ? ` · ${statusDetail(org)}` : ""}`],
    ["Suscripción en Stripe", org.hasSubscription ? "Sí" : "No"],
    ["Usuarios · cuentas", `${org.members} · ${org.channels}`],
    [
      "Créditos de IA",
      org.aiCreditsLimit === null
        ? `${n(org.aiCreditsUsed)} usados · sin límite`
        : `${n(org.aiCreditsUsed)} de ${n(org.aiCreditsLimit)}${org.aiCreditsBonus ? ` (incluye ${n(org.aiCreditsBonus)} extra)` : ""}`,
    ],
    ["Alta", date(org.createdAt)],
    ["Id", org.id],
  ];

  return (
    <Modal layout="drawer" open onClose={onClose} title={org.name} size="xl">
      <div className="space-y-5">
        {error && <Banner tone="danger">{error}</Banner>}
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
          {detail.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd className="break-all">{v}</dd>
            </div>
          ))}
        </dl>

        <div className="space-y-3 border-t border-border pt-4">
          <div>
            <p className="text-sm font-medium">Canales (disponibles por defecto)</p>
            <p className="text-xs text-muted-darker">
              WhatsApp siempre está disponible. Los demás vienen activados desde el alta y el usuario los conecta con sus
              credenciales; usa estos interruptores solo como excepción. Desactivar uno no apaga las cuentas que ya tenga
              conectadas, solo bloquea agregar cuentas nuevas de ese canal.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["telegram", "Telegram"],
                ["messenger", "Messenger"],
                ["instagram", "Instagram"],
                ["webchat", "Web Widget"],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="flex items-center justify-between gap-2 rounded-lg border border-border p-3">
                <span className="text-sm">{label}</span>
                <Switch
                  label={`Habilitar ${label}`}
                  checked={org.channelFlags[key]}
                  disabled={!!busy}
                  onCheckedChange={(checked) =>
                    act(
                      { action: "set_channels", ...org.channelFlags, [key]: checked },
                      `${label} ${checked ? "habilitado" : "deshabilitado"}`
                    )
                  }
                />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3 border-t border-border pt-4">
          <div>
            <p className="text-sm font-medium">WhatsApp: número de la app WhatsApp Business</p>
            <p className="text-xs text-muted-darker">
              Permite conectar el número que el negocio ya usa en la app WhatsApp Business (coexistencia): sigue contestando desde su
              teléfono y todo se ve en Colibly. Encendida por defecto en las organizaciones nuevas; apagarla aquí no desconecta las cuentas que ya lo usan.
            </p>
          </div>
          <div className="flex items-center justify-between gap-2 rounded-lg border border-border p-3">
            <span className="text-sm">Coexistencia de WhatsApp</span>
            <Switch
              label="Habilitar coexistencia de WhatsApp"
              checked={org.whatsappCoexistence}
              disabled={!!busy}
              onCheckedChange={(checked) =>
                act({ action: "set_whatsapp_coexistence", enabled: checked }, `Coexistencia ${checked ? "habilitada" : "deshabilitada"}`)
              }
            />
          </div>
        </div>

        <div className="space-y-3 border-t border-border pt-4">
          <div>
            <p className="text-sm font-medium">WhatsApp por QR (no oficial)</p>
            <p className="text-xs text-muted-darker">
              Vincula un número escaneando un QR, sin la API de Meta. Solo para organizaciones que tú decidas: apagado por
              defecto, no se anuncia y WhatsApp puede suspender el número. Apagarlo detiene sus cuentas (no envían ni reciben) sin borrarlas.
            </p>
          </div>
          <div className="flex items-center justify-between gap-2 rounded-lg border border-border p-3">
            <span className="text-sm">WhatsApp por QR</span>
            <Switch
              label="Habilitar WhatsApp por QR"
              checked={org.whatsappWeb}
              disabled={!!busy}
              onCheckedChange={(checked) =>
                act({ action: "set_whatsapp_web", enabled: checked }, `WhatsApp por QR ${checked ? "habilitado" : "deshabilitado"}`)
              }
            />
          </div>
        </div>

        {!org.isInternal && (
          <div className="space-y-4 border-t border-border pt-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <form
                className="space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  act({ action: "extend_trial", days: Number(days) }, `Prueba extendida ${plural(Number(days), "día")}`);
                }}
              >
                <FormField label="Extender la prueba (días)" hint={canTrial ? "Suma a la fecha de fin, o desde hoy si ya venció." : "Solo sin suscripción de pago vigente."}>
                  {(id) => <Input id={id} type="number" min={1} max={90} value={days} onChange={(e) => setDays(e.target.value)} disabled={!canTrial} />}
                </FormField>
                <Button type="submit" variant="secondary" icon={CalendarPlus} loading={busy === "extend_trial"} disabled={!canTrial || !!busy}>
                  Extender prueba
                </Button>
              </form>
              <form
                className="space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  act({ action: "grant_credits", credits: Number(credits) }, `${credits} créditos agregados`);
                }}
              >
                <FormField label="Dar créditos de IA" hint="Extra solo para el periodo actual.">
                  {(id) => <Input id={id} type="number" min={1} max={100000} value={credits} onChange={(e) => setCredits(e.target.value)} />}
                </FormField>
                <Button type="submit" variant="secondary" icon={AiMark} loading={busy === "grant_credits"} disabled={!!busy}>
                  Dar créditos
                </Button>
              </form>
            </div>

            <div className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted">
                {org.status === "SUSPENDED"
                  ? "Suspendida: nadie de la organización puede entrar. Al reactivarla vuelve al estado que le corresponde (Stripe o su prueba)."
                  : "Suspender bloquea el acceso de todos sus usuarios (abuso, fraude). No borra datos."}
              </p>
              {org.status === "SUSPENDED" ? (
                <Button variant="secondary" icon={ShieldCheck} loading={busy === "reactivate"} disabled={!!busy} onClick={() => act({ action: "reactivate" }, "Organización reactivada")} className="shrink-0">
                  Reactivar
                </Button>
              ) : (
                <Button variant="danger" icon={ShieldOff} disabled={!!busy} onClick={() => setConfirmSuspend(true)} className="shrink-0">
                  Suspender
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
      <ConfirmDialog
        open={confirmSuspend}
        onClose={() => setConfirmSuspend(false)}
        onConfirm={() => act({ action: "suspend" }, "Organización suspendida")}
        title={`¿Suspender “${org.name}”?`}
        description="Dejan de poder escribir o enviar en segundos y pierden el acceso en uno o dos minutos. Se puede revertir con Reactivar."
        confirmLabel="Suspender"
        tone="danger"
        loading={busy === "suspend"}
      />
    </Modal>
  );
}
