"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Bot, Megaphone, UserCheck, Zap } from "lucide-react";
import { Badge } from "@/app/components/ui/badge";
import { PageHeader } from "@/app/components/ui/page-header";
import { KpiStrip, type KpiItem } from "@/app/components/ui/kpi-strip";
import { SectionHeader } from "@/app/components/ui/section-header";
import { Workbench, WorkbenchMain, WorkbenchAside } from "@/app/components/ui/workbench";
import { Table, type TableColumn } from "@/app/components/ui/table";
import type { Estadisticas } from "@/lib/estadisticas/get-stats";
import { CAMPAIGN_ORIGIN_LABEL, LABEL_TEXT } from "@/lib/whatsapp/export-columns";
import { MessagesTrendChart, HorizontalBarChart, DeliveryComparisonChart, QualifiedLabelDonut } from "./_charts";

const BOT_STATUS_BADGE: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  ACTIVE: { label: "Activo", tone: "success" },
  ERROR: { label: "Error", tone: "danger" },
};

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
  return `$${Math.round(value).toLocaleString()}`;
}

export function EstadisticasView({ stats }: { stats: Estadisticas }) {
  const botColumns: TableColumn<BotBreakdownRow>[] = useMemo(() => [
    {
      key: "name",
      header: "Bot",
      render: (b) => (
        <Link href={`/whatsapp/bots/${b.id}`} className="font-medium hover:text-accent transition-colors">
          {b.name}
        </Link>
      ),
    },
    {
      key: "status",
      header: "Estado",
      render: (b) => {
        const badge = BOT_STATUS_BADGE[b.status] ?? { label: b.status, tone: "neutral" as const };
        return <Badge tone={badge.tone} size="sm">{badge.label}</Badge>;
      },
    },
    {
      key: "interactions",
      header: "Interacciones",
      headerClassName: "text-right",
      cellClassName: "text-right font-mono text-xs",
      render: (b) => b.interactions,
    },
    {
      key: "totalCost",
      header: "Costo",
      headerClassName: "text-right",
      cellClassName: "text-right",
      render: (b) => <span className="font-mono text-xs">{formatCost(b.totalCost)}</span>,
    },
  ], []);

  const agentColumns: TableColumn<AgentPerformanceRow>[] = useMemo(() => [
    { key: "userName", header: "Agente", render: (a) => <span className="font-medium">{a.userName ?? "Sin nombre"}</span> },
    {
      key: "resolvedCount",
      header: "Resueltos",
      headerClassName: "text-right",
      cellClassName: "text-right font-mono text-xs",
      render: (a) => a.resolvedCount,
    },
    {
      key: "avgFirstResponseMinutes",
      header: "1ra respuesta (prom.)",
      headerClassName: "text-right",
      cellClassName: "text-right font-mono text-xs",
      render: (a) => (a.avgFirstResponseMinutes != null ? `${a.avgFirstResponseMinutes} min` : "—"),
    },
    {
      key: "avgResolutionMinutes",
      header: "Resolución (prom.)",
      headerClassName: "text-right",
      cellClassName: "text-right font-mono text-xs",
      render: (a) => (a.avgResolutionMinutes != null ? `${a.avgResolutionMinutes} min` : "—"),
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
    { key: "sent", header: "Enviados", headerClassName: "text-right", cellClassName: "text-right font-mono text-xs", render: (r) => r.sent, hideBelow: "md" },
    { key: "delivered", header: "Entregados", headerClassName: "text-right", cellClassName: "text-right font-mono text-xs", render: (r) => r.delivered, hideBelow: "sm" },
    { key: "read", header: "Leídos", headerClassName: "text-right", cellClassName: "text-right font-mono text-xs", render: (r) => r.read },
    { key: "failed", header: "Fallidos", headerClassName: "text-right", cellClassName: "text-right font-mono text-xs", render: (r) => r.failed, hideBelow: "md" },
    {
      key: "deliveryRate",
      header: "Tasa entrega",
      headerClassName: "text-right",
      cellClassName: "text-right font-mono text-xs",
      render: (r) => (r.deliveryRate != null ? `${r.deliveryRate}%` : "—"),
    },
    {
      key: "readRate",
      header: "Tasa lectura",
      headerClassName: "text-right",
      cellClassName: "text-right font-mono text-xs",
      render: (r) => (r.readRate != null ? `${r.readRate}%` : "—"),
    },
  ], []);

  const kpis: KpiItem[] = [
    { label: "Cuentas", value: String(stats.accounts), href: "/whatsapp/cuentas" },
    { label: "Chats activos", value: String(stats.chats), href: "/whatsapp/chat" },
    { label: "Mensajes", value: stats.messages.toLocaleString("es-MX"), href: "/whatsapp/chat" },
    { label: "Bots IA", value: `${stats.activeBots}/${stats.bots}`, hint: "activos", href: "/whatsapp/bots" },
    {
      label: "Campañas",
      value: `${stats.campaignsCompleted}/${stats.campaigns}`,
      hint: "completadas",
      href: "/whatsapp/campanas",
    },
  ];

  const creditsPct = stats.aiCredits.limit ? Math.min(100, (stats.aiCredits.used / stats.aiCredits.limit) * 100) : null;

  return (
    <div className="space-y-10">
      <div className="animate-fade-in-up">
        <PageHeader title="Estadísticas" description="Métricas globales de uso de la plataforma." />
      </div>

      <div className="animate-fade-in-up animation-delay-100">
        <KpiStrip items={kpis} />
      </div>

      <Workbench>
        <WorkbenchMain>
          <section className="animate-fade-in-up animation-delay-200">
            <SectionHeader eyebrow="Actividad" title="Mensajes diarios" />
            <div className="mt-4">
              <MessagesTrendChart data={stats.dailyMessages} />
            </div>
          </section>

          <section className="animate-fade-in-up animation-delay-300">
            <SectionHeader eyebrow="Difusión" title="Mensajes por campaña / automatización" />
            <div className="mt-4">
              <Table
                columns={campaignColumns}
                rows={stats.campaignMessageBreakdown}
                rowKey={(r) => `${r.origin}-${r.id}`}
                emptyIcon={Megaphone}
                emptyTitle="Sin envíos todavía"
                emptyDescription="Aparecerán aquí una vez que se envíe una campaña masiva o se dispare una automatización de leads."
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
          </section>

          <section className="animate-fade-in-up animation-delay-300">
            <SectionHeader eyebrow="Automatización" title="Uso por bot" />
            <div className="mt-4">
              <Table
                columns={botColumns}
                rows={stats.botBreakdown}
                rowKey={(b) => b.id}
                emptyIcon={Bot}
                emptyTitle="Sin bots todavía"
                mobileCard={(b) => {
                  const status = botColumns.find((c) => c.key === "status")!;
                  const cost = botColumns.find((c) => c.key === "totalCost")!;
                  return (
                    <div className="w-full min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <Link href={`/whatsapp/bots/${b.id}`} className="truncate text-sm font-medium hover:text-accent transition-colors">
                          {b.name}
                        </Link>
                        {status.render(b)}
                      </div>
                      <div className="flex items-center justify-between gap-2 text-xs text-muted-darker">
                        <span>{b.interactions} interacciones</span>
                        {cost.render(b)}
                      </div>
                    </div>
                  );
                }}
              />
            </div>
          </section>

          <section className="animate-fade-in-up animation-delay-400">
            <SectionHeader eyebrow="Equipo" title="Rendimiento por agente" />
            <div className="mt-4">
              <Table
                columns={agentColumns}
                rows={stats.agentPerformance}
                rowKey={(a) => a.userId}
                emptyIcon={UserCheck}
                emptyTitle="Sin datos todavía"
                emptyDescription="Aparecerán agentes aquí una vez que se asignen y respondan chats."
                mobileCard={(a) => {
                  const firstResponse = agentColumns.find((c) => c.key === "avgFirstResponseMinutes")!;
                  const resolution = agentColumns.find((c) => c.key === "avgResolutionMinutes")!;
                  return (
                    <div className="w-full min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{a.userName ?? "Sin nombre"}</span>
                        <span className="shrink-0 text-xs text-muted-darker">{a.resolvedCount} resueltos</span>
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
          </section>
        </WorkbenchMain>

        <WorkbenchAside>
          <section className="animate-fade-in-up animation-delay-200">
            <SectionHeader eyebrow="Inteligencia artificial" title="Inversión en IA" />
            <div className="mt-3 space-y-4">
              <div>
                <p className="font-mono text-hero font-semibold tracking-tight">{formatCost(stats.totalCost)}</p>
                <p className="text-xs text-muted">costo estimado histórico</p>
              </div>
              <div className="flex items-baseline gap-2">
                <Zap size={13} className="text-info shrink-0 self-center" />
                <span className="font-mono text-sm font-medium">{stats.totalTokens.toLocaleString("es-MX")}</span>
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
                      className={`h-full rounded-full transition-all ${
                        stats.aiCredits.used >= stats.aiCredits.limit ? "bg-danger" : creditsPct >= 80 ? "bg-warning" : "bg-accent"
                      }`}
                      style={{ width: `${creditsPct}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="animate-fade-in-up animation-delay-300">
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
                  <p className="text-eyebrow font-medium uppercase tracking-wider text-muted-darker">Por campaña</p>
                  <HorizontalBarChart
                    data={stats.qualifiedChatsByCampaign.map((c) => ({ id: c.id ?? "__none__", label: c.name, value: c.count }))}
                    color="var(--accent)"
                  />
                </div>
              )}
            </div>
          </section>

          <section className="animate-fade-in-up animation-delay-300">
            <SectionHeader eyebrow="Difusión" title="Entregas por origen" />
            <div className="mt-3 space-y-3">
              <DeliveryComparisonChart data={stats.campaignMessagesByOrigin} />
              <div className="space-y-1.5">
                {stats.campaignMessagesByOrigin.map((o) => (
                  <div key={o.origin} className="flex items-center justify-between text-xs">
                    <span className="font-medium text-muted-darker">{CAMPAIGN_ORIGIN_LABEL[o.origin]}</span>
                    <span className="tabular-nums text-muted">
                      {o.total === 0 ? (
                        "Sin envíos todavía"
                      ) : (
                        <>Entrega: {o.deliveryRate != null ? `${o.deliveryRate}%` : "—"} · Lectura: {o.readRate != null ? `${o.readRate}%` : "—"}</>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="animate-fade-in-up animation-delay-400">
            <SectionHeader eyebrow="Canales" title="Chats por número" />
            <div className="mt-3">
              <HorizontalBarChart
                data={stats.accountBreakdown.map((a) => ({ id: a.id, label: a.name, value: a.chats, sublabel: a.phoneNumber ?? undefined }))}
                color="var(--accent-2)"
                emptyLabel="Sin cuentas todavía"
              />
            </div>
          </section>
        </WorkbenchAside>
      </Workbench>
    </div>
  );
}
