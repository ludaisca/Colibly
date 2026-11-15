"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Zap } from "lucide-react";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { PageHeader } from "@/app/components/ui/page-header";
import { KpiStrip, type KpiItem } from "@/app/components/ui/kpi-strip";
import { SectionHeader } from "@/app/components/ui/section-header";
import { Card } from "@/app/components/ui/card";
import { Workbench, WorkbenchMain, WorkbenchAside } from "@/app/components/ui/workbench";
import { Table, type TableColumn } from "@/app/components/ui/table";
import type { Estadisticas } from "@/lib/estadisticas/get-stats";
import { CAMPAIGN_ORIGIN_LABEL, LABEL_TEXT } from "@/lib/whatsapp/export-columns";
import { MessagesTrendChart, HorizontalBarChart, EntityBars, DeliveryComparisonChart, QualifiedLabelDonut } from "./_charts";
import { formatDuration } from "@/lib/format/duration";
import { plural } from "@/lib/format/plural";
import { BOT_DISPLAY_STATUS_LABEL } from "@/lib/bots/display-status";


const CAMPAIGN_ORIGIN_BADGE: Record<string, "accent" | "info"> = {
  manual: "accent",
  automatizacion: "info",
};

type BotBreakdownRow = Estadisticas["botBreakdown"][number];
type AgentPerformanceRow = Estadisticas["agentPerformance"][number];
type CampaignBreakdownRow = Estadisticas["campaignMessageBreakdown"][number];

function formatCost(value: number): string {
  if (value === 0) return "$0";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  if (value < 1) return `$${value.toFixed(3)}`;
  if (value < 100) return `$${value.toFixed(2)}`;
  return `$${Math.round(value).toLocaleString("es-MX")}`;
}

export function EstadisticasView({ stats, canManageBots }: { stats: Estadisticas; canManageBots: boolean }) {
  const accountChannels = new Set(stats.accountBreakdown.map((account) => account.channel));
  const accountsHref = accountChannels.size === 1
    ? `/${stats.accountBreakdown[0].channel.toLowerCase()}/cuentas`
    : undefined;
  const botColumns: TableColumn<BotBreakdownRow>[] = useMemo(() => [
    {
      key: "name",
      header: "Bot",
      render: (b) => canManageBots
        ? <Link href={`/whatsapp/bots/${b.id}`} className="tap-target font-medium hover:text-accent-ink transition-colors">{b.name}</Link>
        : <span className="font-medium">{b.name}</span>,
    },
    {
      key: "status",
      header: "Estado",
      render: (b) => {
        const badge = BOT_DISPLAY_STATUS_LABEL[b.status];
        return <Badge tone={badge.tone} size="sm">{badge.label}</Badge>;
      },
    },
    {
      key: "interactions",
      header: "Interacciones",
      headerClassName: "text-right",
      cellClassName: "text-right tabular-nums text-xs",
      render: (b) => b.interactions,
    },
    {
      key: "totalCost",
      header: "Costo",
      headerClassName: "text-right",
      cellClassName: "text-right",
      render: (b) => <span className="tabular-nums text-xs">{formatCost(b.totalCost)}</span>,
    },
  ], [canManageBots]);

  const agentColumns: TableColumn<AgentPerformanceRow>[] = useMemo(() => [
    { key: "userName", header: "Agente", render: (a) => <span className="font-medium">{a.userName ?? "Sin nombre"}</span> },
    {
      key: "resolvedCount",
      header: "Resueltos",
      headerClassName: "text-right",
      cellClassName: "text-right tabular-nums text-xs",
      render: (a) => a.resolvedCount,
    },
    {
      key: "medianFirstResponseMinutes",
      header: "1ra respuesta (mediana)",
      headerClassName: "text-right",
      cellClassName: "text-right tabular-nums text-xs",
      render: (a) => (
        <span title={a.avgFirstResponseMinutes == null ? undefined : `Promedio: ${formatDuration(a.avgFirstResponseMinutes)} · ${a.respondedCount} conversaciones`}>
          {formatDuration(a.medianFirstResponseMinutes)}
        </span>
      ),
    },
    {
      key: "avgResolutionMinutes",
      header: "Resolución (prom.)",
      headerClassName: "text-right",
      cellClassName: "text-right tabular-nums text-xs",
      render: (a) => formatDuration(a.avgResolutionMinutes),
    },
  ], []);

  const campaignColumns: TableColumn<CampaignBreakdownRow>[] = useMemo(() => [
    {
      key: "name",
      header: "Campaña / fuente",
      render: (r) => <span className="font-medium">{r.name}</span>,
    },
    {
      key: "origin",
      header: "Origen",
      render: (r) => <Badge tone={CAMPAIGN_ORIGIN_BADGE[r.origin]} size="sm">{CAMPAIGN_ORIGIN_LABEL[r.origin]}</Badge>,
    },
    { key: "sent", header: "Enviados", headerClassName: "text-right", cellClassName: "text-right tabular-nums text-xs", render: (r) => r.sent, hideBelow: "md" },
    { key: "delivered", header: "Entregados", headerClassName: "text-right", cellClassName: "text-right tabular-nums text-xs", render: (r) => r.delivered, hideBelow: "sm" },
    { key: "read", header: "Leídos", headerClassName: "text-right", cellClassName: "text-right tabular-nums text-xs", render: (r) => r.read },
    { key: "failed", header: "Fallidos", headerClassName: "text-right", cellClassName: "text-right tabular-nums text-xs", render: (r) => r.failed, hideBelow: "md" },
    {
      key: "deliveryRate",
      header: "Tasa entrega",
      headerClassName: "text-right",
      cellClassName: "text-right tabular-nums text-xs",
      render: (r) => (r.deliveryRate != null ? `${r.deliveryRate}%` : "—"),
    },
    {
      key: "readRate",
      header: "Tasa lectura",
      headerClassName: "text-right",
      cellClassName: "text-right tabular-nums text-xs",
      render: (r) => (r.readRate != null ? `${r.readRate}%` : "—"),
    },
  ], []);

  const kpis: KpiItem[] = [
    { label: "Cuentas", value: String(stats.accounts), href: accountsHref },
    { label: "Chats activos", value: String(stats.chats), href: "/whatsapp/chat" },
    { label: "Mensajes", value: stats.messages.toLocaleString("es-MX"), href: "/whatsapp/chat" },
    { label: "Bots IA", value: `${stats.activeBots}/${stats.bots}`, hint: "activos", href: canManageBots ? "/whatsapp/bots" : undefined },
    {
      label: "Campañas",
      value: `${stats.campaignsCompleted}/${stats.campaigns}`,
      hint: "completadas",
      href: "/whatsapp/campanas",
    },
  ];

  const creditsPct = stats.aiCredits.limit ? Math.min(100, (stats.aiCredits.used / stats.aiCredits.limit) * 100) : null;

  return (
    <div className="space-y-6">
      <div>
        <PageHeader
          title="Estadísticas"
          actions={<Button variant="secondary" href="/estadisticas/reportes">Reportes por periodo</Button>}
        />
      </div>

      <div>
        <KpiStrip items={kpis} />
      </div>

      <Workbench>
        <WorkbenchMain>
          <Card as="section" >
            <SectionHeader eyebrow="Actividad" title="Mensajes diarios" />
            <div className="mt-4">
              <MessagesTrendChart data={stats.dailyMessages} />
            </div>
          </Card>

          <Card as="section" >
            <SectionHeader eyebrow="Difusión" title="Mensajes por campaña / automatización" />
            <div className="mt-4">
              <Table
                className="px-5 sm:px-0"
                columns={campaignColumns}
                rows={stats.campaignMessageBreakdown}
                rowKey={(r) => `${r.origin}-${r.id}`}
                emptyTitle="Sin envíos en este periodo."
                mobileCard={(r) => (
                  <div className="w-full min-w-0 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{r.name}</span>
                      <Badge tone={CAMPAIGN_ORIGIN_BADGE[r.origin]} size="sm">{CAMPAIGN_ORIGIN_LABEL[r.origin]}</Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-darker">
                      <span>{r.sent} enviados</span>
                      <span>{r.delivered} entregados</span>
                      <span>{r.read} leídos</span>
                      {r.failed > 0 && <span className="text-danger">{r.failed} fallidos</span>}
                    </div>
                  </div>
                )}
              />
            </div>
          </Card>

          <Card as="section" >
            <SectionHeader eyebrow="Automatización" title="Uso por bot" />
            <div className="mt-4">
              <Table
                className="px-5 sm:px-0"
                columns={botColumns}
                rows={stats.botBreakdown}
                rowKey={(b) => b.id}
                emptyTitle="Sin bots todavía."
                mobileCard={(b) => {
                  const status = botColumns.find((c) => c.key === "status")!;
                  const cost = botColumns.find((c) => c.key === "totalCost")!;
                  return (
                    <div className="w-full min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        {canManageBots
                          ? <Link href={`/whatsapp/bots/${b.id}`} className="tap-target truncate text-sm font-medium hover:text-accent-ink transition-colors">{b.name}</Link>
                          : <span className="truncate text-sm font-medium">{b.name}</span>}
                        {status.render(b)}
                      </div>
                      <div className="flex items-center justify-between gap-2 text-xs text-muted-darker">
                        <span>{plural(b.interactions, "interacción", "interacciones")}</span>
                        {cost.render(b)}
                      </div>
                    </div>
                  );
                }}
              />
            </div>
          </Card>

          <Card as="section" >
            <SectionHeader eyebrow="Equipo" title="Rendimiento por agente" />
            {stats.firstResponse.count > 0 && (
              <p className="mt-2 text-sm text-muted-darker" title="Desde el primer mensaje de cada conversación que inició el cliente hasta la primera respuesta (persona, bot o app). No cuentan campañas, avisos automáticos, historial importado ni conversaciones sin respuesta.">
                Primera respuesta en 14 días: <span className="font-semibold text-foreground">{formatDuration(stats.firstResponse.medianMinutes)}</span> de mediana · promedio {formatDuration(stats.firstResponse.avgMinutes)} · {stats.firstResponse.count.toLocaleString("es-MX")} conversaciones
              </p>
            )}
            <div className="mt-4">
              <Table
                className="px-5 sm:px-0"
                columns={agentColumns}
                rows={stats.agentPerformance}
                rowKey={(a) => a.userId}
                emptyTitle="Sin respuestas de agentes en este periodo."
                mobileCard={(a) => {
                  const firstResponse = agentColumns.find((c) => c.key === "medianFirstResponseMinutes")!;
                  const resolution = agentColumns.find((c) => c.key === "avgResolutionMinutes")!;
                  return (
                    <div className="w-full min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{a.userName ?? "Sin nombre"}</span>
                        <span className="shrink-0 text-xs text-muted-darker">{plural(a.resolvedCount, "resuelto")}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-darker">
                        <span>1ra: {firstResponse.render(a)}</span>
                        <span>Res: {resolution.render(a)}</span>
                      </div>
                    </div>
                  );
                }}
              />
            </div>
          </Card>
        </WorkbenchMain>

        <WorkbenchAside>
          <Card as="section" >
            <SectionHeader eyebrow="Inteligencia artificial" title="Inversión en IA" />
            <div className="mt-3 space-y-4">
              <div>
                <p className="tabular-nums text-3xl font-semibold tracking-tight">{formatCost(stats.totalCost)}</p>
                <p className="text-xs text-muted">costo estimado histórico</p>
              </div>
              <div className="flex items-baseline gap-2">
                <Zap size={13} className="text-info shrink-0 self-center" />
                <span className="text-sm font-medium tabular-nums">{stats.totalTokens.toLocaleString("es-MX")}</span>
                <span className="text-xs text-muted">tokens consumidos</span>
              </div>

              {stats.aiCredits.limit != null && creditsPct != null && (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs text-muted-darker">Créditos de IA del mes</p>
                    <p className="text-xs font-medium tabular-nums">
                      {stats.aiCredits.used.toLocaleString("es-MX")} / {stats.aiCredits.limit.toLocaleString("es-MX")}
                    </p>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface">
                    <div
                      className={`h-full rounded-full transition-[width] ${
                        stats.aiCredits.used >= stats.aiCredits.limit ? "bg-danger" : creditsPct >= 80 ? "bg-warning" : "bg-accent"
                      }`}
                      style={{ width: `${creditsPct}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </Card>

          <Card as="section" >
            <SectionHeader eyebrow="Leads" title="Chats calificados" />
            <div className="mt-3 space-y-4">
              <QualifiedLabelDonut data={stats.qualifiedChats.byLabel} labelText={LABEL_TEXT} total={stats.qualifiedChats.total} />
              {/* Deduplicado por chat (mejor score) — por eso puede no coincidir
                  con la pestaña "Leads calificados", que lista cada evaluación. */}
              <p className="text-xs text-muted" title="Chats únicos con al menos una calificación — no evaluaciones individuales">
                {stats.qualifiedChats.total} chats únicos, no evaluaciones
              </p>

              {stats.qualifiedChatsByCampaign.length > 0 && (
                <div className="space-y-2 pt-2">
                  <p className="text-eyebrow font-medium text-muted-darker">Por campaña</p>
                  <HorizontalBarChart
                    data={stats.qualifiedChatsByCampaign.map((c) => ({ id: c.id ?? "__none__", label: c.name, value: c.count }))}
                    color="var(--accent)"
                  />
                </div>
              )}
            </div>
          </Card>

          <Card as="section" >
            <SectionHeader eyebrow="Difusión" title="Entregas por origen" />
            <div className="mt-3 space-y-3">
              <DeliveryComparisonChart data={stats.campaignMessagesByOrigin} />
              <div className="space-y-1.5">
                {stats.campaignMessagesByOrigin.map((o) => (
                  <div key={o.origin} className="flex items-center justify-between text-xs">
                    <span className="font-medium text-muted-darker">{CAMPAIGN_ORIGIN_LABEL[o.origin]}</span>
                    <span className="tabular-nums text-muted">
                      {o.total === 0 ? (
                        "Sin envíos en este periodo."
                      ) : (
                        <>Entrega: {o.deliveryRate != null ? `${o.deliveryRate}%` : "—"} · Lectura: {o.readRate != null ? `${o.readRate}%` : "—"}</>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Card as="section" >
            <SectionHeader eyebrow="Canales" title="Chats por cuenta" />
            <div className="mt-3">
              <EntityBars
                data={stats.accountBreakdown.map((a) => ({ id: a.id, label: a.name, value: a.chats, sublabel: a.phoneNumber ?? undefined }))}
                emptyLabel="Sin cuentas todavía"
              />
            </div>
          </Card>
        </WorkbenchAside>
      </Workbench>
    </div>
  );
}
