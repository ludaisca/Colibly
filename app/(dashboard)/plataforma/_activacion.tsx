"use client";

import { useCallback, useState } from "react";
import { Mail, RefreshCw, Sprout } from "lucide-react";
import { SectionHeader } from "@/app/components/ui/section-header";
import { Card } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
import { Banner } from "@/app/components/ui/banner";
import { KpiStrip } from "@/app/components/ui/kpi-strip";
import { Progress } from "@/app/components/ui/progress";
import { PageContainer } from "@/app/components/ui/page-container";
import { RelativeTime } from "@/app/components/ui/relative-time";
import { Table, type TableColumn } from "@/app/components/ui/table";
import { COHORT_DAYS, type FunnelRow } from "@/lib/activation/rules";
import type { ActivationReport, StuckOrg } from "@/lib/activation/report";
import { useRunOnChange } from "@/app/components/ui/use-run-on-change";

// Embudo de activación: de cada cohorte de registros, cuántos llegan a cada
// paso y en cuánto tiempo, y las cuentas en prueba ordenadas de la más
// atorada a la menos (para escribirles a mano). Datos: GET /api/plataforma/activacion.

const NUDGE_LABEL: Record<string, string> = {
  channel: "canal",
  first_message: "primer mensaje",
  automation: "bot",
  team: "equipo",
};

function duration(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 1) return "< 1 h";
  if (hours < 48) return `${Math.round(hours)} h`;
  return `${Math.round(hours / 24)} días`;
}

export function PlataformaActivacion() {
  const [days, setDays] = useState<number>(30);
  const [report, setReport] = useState<ActivationReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (d: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/plataforma/activacion?dias=${d}`);
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "No se pudo cargar el embudo");
      setReport(body as ActivationReport);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el embudo");
    } finally {
      setLoading(false);
    }
  }, []);

  useRunOnChange(() => void load(days), [days, load]);

  const step = (key: FunnelRow["step"]) => report?.funnel.find((r) => r.step === key);
  const columns: TableColumn<StuckOrg>[] = [
    {
      key: "name",
      header: "Organización",
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{r.name}</p>
          <p className="truncate text-xs text-muted-darker">{r.ownerEmail ?? "sin dueño"}</p>
        </div>
      ),
    },
    {
      key: "stuck",
      header: "Dónde va",
      render: (r) => (
        <div className="min-w-[10rem] space-y-1">
          <p className="text-sm text-foreground">{r.stuckLabel}</p>
          <Progress value={(r.progress / 5) * 100} tone={r.progress <= 1 ? "danger" : r.progress <= 3 ? "warning" : "accent"} />
        </div>
      ),
    },
    {
      key: "trial",
      header: "Prueba",
      cellClassName: "tabular-nums",
      render: (r) =>
        r.trialDaysLeft === null ? "—" : (
          <Badge tone={r.trialDaysLeft <= 3 ? "danger" : r.trialDaysLeft <= 7 ? "warning" : "neutral"}>
            {r.trialDaysLeft === 1 ? "1 día" : `${r.trialDaysLeft} días`}
          </Badge>
        ),
    },
    {
      key: "nudges",
      header: "Consejos enviados",
      hideBelow: "md",
      render: (r) =>
        r.optOut ? (
          <span className="text-xs text-muted-darker">Se dio de baja</span>
        ) : r.nudgesSent.length ? (
          <span className="text-xs text-muted-darker">{r.nudgesSent.map((k) => NUDGE_LABEL[k] ?? k).join(" · ")}</span>
        ) : (
          <span className="text-xs text-muted-darker">Ninguno</span>
        ),
    },
    { key: "created", header: "Alta", hideBelow: "sm", render: (r) => <RelativeTime value={r.createdAt} className="text-sm text-muted-darker" /> },
  ];

  return (
    <PageContainer width="6xl" className="space-y-6">
      <SectionHeader
        title="Activación"
        eyebrow="Cohorte por fecha de registro"
        action={
          <div className="flex flex-wrap items-center gap-2">
            {COHORT_DAYS.map((d) => (
              <Button key={d} size="sm" variant={d === days ? "primary" : "secondary"} onClick={() => setDays(d)} aria-pressed={d === days}>
                {d} días
              </Button>
            ))}
            <Button size="sm" variant="ghost" icon={RefreshCw} loading={loading} onClick={() => void load(days)} aria-label="Actualizar" />
          </div>
        }
      />

      {error && <Banner tone="danger">{error}</Banner>}

      {report && (
        <>
          <KpiStrip
            size="compact"
            columns={4}
            items={[
              { label: "Registros", value: String(report.signups), hint: `Últimos ${report.cohortDays} días, sin organizaciones internas` },
              {
                label: "Conectaron un canal",
                value: `${step("channel")?.pctOfSignups ?? 0}%`,
                hint: `Mediana: ${duration(step("channel")?.medianHours ?? null)} desde el registro`,
              },
              {
                label: "Contestaron un mensaje",
                value: `${step("firstReply")?.pctOfSignups ?? 0}%`,
                hint: "El primer valor: un cliente escribió y alguien (o el bot) le contestó",
              },
              { label: "Contrataron", value: `${step("paid")?.pctOfSignups ?? 0}%`, hint: `${step("paid")?.count ?? 0} de ${report.signups}` },
            ]}
          />

          <Card padding="none">
            <ol className="divide-y divide-border">
              {report.funnel.map((r) => (
                <li key={r.step} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[14rem_minmax(0,1fr)_5rem_6rem_6rem]">
                  <span className="text-sm font-medium text-foreground">{r.label}</span>
                  <span className="order-last col-span-2 sm:order-none sm:col-span-1">
                    <Progress value={r.pctOfSignups} />
                  </span>
                  <span className="text-right text-sm tabular-nums text-foreground">{r.count}</span>
                  <span className="hidden text-right text-xs tabular-nums text-muted-darker sm:block" title="Sobre el paso anterior">
                    {r.step === "signup" ? "" : `${r.pctOfPrevious}% del anterior`}
                  </span>
                  <span className="hidden text-right text-xs tabular-nums text-muted-darker sm:block" title="Mediana desde el registro">
                    {r.step === "signup" ? "" : duration(r.medianHours)}
                  </span>
                </li>
              ))}
            </ol>
          </Card>
          <p className="text-xs text-muted-darker">
            Cada paso cuenta a quien lo cumplió aunque se haya saltado uno anterior. Los hitos se registran cada hora; las fechas son las del primer
            hecho real (primer canal, primer mensaje…).
          </p>

          <SectionHeader title="En prueba" eyebrow={`${report.trialing.length} organizaciones · las más atoradas primero`} />
          <Table
            columns={columns}
            rows={report.trialing}
            rowKey={(r) => r.id}
            loading={loading && !report}
            emptyIcon={Sprout}
            emptyTitle="Nadie en prueba en esta cohorte"
            emptyDescription="Cuando alguien se registre aparecerá aquí con el paso en que va."
            rowActions={(r) =>
              r.ownerEmail ? (
                <a
                  href={`mailto:${r.ownerEmail}`}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-accent-ink hover:bg-surface-light"
                  aria-label={`Escribir a ${r.ownerEmail}`}
                >
                  <Mail size={14} /> Escribir
                </a>
              ) : null
            }
          />
        </>
      )}
    </PageContainer>
  );
}
