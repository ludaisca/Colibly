"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Download, Users } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Card } from "@/app/components/ui/card";
import { Input } from "@/app/components/ui/input";
import { KpiStrip, type KpiItem } from "@/app/components/ui/kpi-strip";
import { Modal } from "@/app/components/ui/modal";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionHeader } from "@/app/components/ui/section-header";
import { Table, type TableColumn } from "@/app/components/ui/table";
import { downloadCsv, toCsv } from "@/lib/csv";
import { centsToPesos, formatMxn } from "@/lib/money";
import { LivePanel } from "./_live";
import { ActivityHeatmap } from "./_heatmap";
import type { ActivityHeatmap as ActivityHeatmapData } from "@/lib/estadisticas/heatmap";
import type { BotPerformance } from "@/lib/estadisticas/bot-performance-rules";
import type { AgentReport, ChannelReport, RangeReport } from "@/lib/estadisticas/reports";

const CHANNEL_LABEL: Record<string, string> = {
  WHATSAPP: "WhatsApp",
  TELEGRAM: "Telegram",
  MESSENGER: "Messenger",
  INSTAGRAM: "Instagram",
  WEBCHAT: "Chat web",
};

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Abierto",
  PENDING: "Pendiente",
  RESOLVED: "Resuelto",
};

function formatMinutes(value: number | null): string {
  if (value == null) return "—";
  if (value < 60) return `${Math.round(value)} min`;
  const hours = Math.floor(value / 60);
  const minutes = Math.round(value % 60);
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

function shiftKey(key: string, days: number): string {
  const date = new Date(`${key}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function ReportsView({ data, heatmap, bot, fromKey, toKey }: { data: RangeReport; heatmap: ActivityHeatmapData; bot: BotPerformance; fromKey: string; toKey: string }) {
  const router = useRouter();
  const [from, setFrom] = useState(fromKey);
  const [to, setTo] = useState(toKey);
  const [agentModal, setAgentModal] = useState<AgentReport | null>(null);

  function applyRange(nextFrom = from, nextTo = to) {
    if (!nextFrom || !nextTo) return;
    const params = new URLSearchParams({ from: nextFrom, to: nextTo });
    router.push(`/estadisticas/reportes?${params.toString()}`);
  }

  const agentColumns: TableColumn<AgentReport>[] = useMemo(() => [
    {
      key: "agent",
      header: "Agente",
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{row.userName}</p>
          {row.email && <p className="truncate text-xs text-muted">{row.email}</p>}
        </div>
      ),
    },
    {
      key: "newChats",
      header: "Nuevos",
      headerClassName: "text-right",
      cellClassName: "text-right tabular-nums",
      render: (row) => row.newChats,
    },
    {
      key: "resolved",
      header: "Resueltos",
      headerClassName: "text-right",
      cellClassName: "text-right tabular-nums",
      render: (row) => row.resolved,
    },
    {
      key: "frt",
      header: "1ª respuesta",
      headerClassName: "text-right",
      cellClassName: "text-right tabular-nums",
      hideBelow: "md",
      render: (row) => formatMinutes(row.avgFirstResponseMinutes),
    },
    {
      key: "resolution",
      header: "Resolución",
      headerClassName: "text-right",
      cellClassName: "text-right tabular-nums",
      hideBelow: "md",
      render: (row) => formatMinutes(row.avgResolutionMinutes),
    },
    {
      key: "open",
      header: "",
      headerClassName: "w-8",
      cellClassName: "w-8 text-right",
      render: () => <ChevronRight size={15} className="ml-auto text-muted-darker" />,
    },
  ], []);

  const channelColumns: TableColumn<ChannelReport>[] = useMemo(() => [
    {
      key: "channel",
      header: "Canal",
      render: (row) => CHANNEL_LABEL[row.channel] ?? row.channel,
    },
    {
      key: "newChats",
      header: "Nuevos",
      headerClassName: "text-right",
      cellClassName: "text-right tabular-nums",
      render: (row) => row.newChats,
    },
    {
      key: "resolved",
      header: "Resueltos",
      headerClassName: "text-right",
      cellClassName: "text-right tabular-nums",
      render: (row) => row.resolved,
    },
  ], []);

  const kpis: KpiItem[] = [
    { label: "Chats nuevos", value: String(data.totals.newChats) },
    { label: "Resueltos", value: String(data.totals.resolved) },
    { label: "Mensajes", value: data.totals.messages.toLocaleString("es-MX") },
    { label: "1ª respuesta", value: formatMinutes(data.totals.avgFirstResponseMinutes) },
    { label: "Resolución", value: formatMinutes(data.totals.avgResolutionMinutes) },
    { label: "Sin asignar", value: String(data.totals.unassigned), hint: `${data.totals.open} abiertos` },
    {
      label: "CSAT",
      value: data.totals.csatAvg == null ? "—" : `${data.totals.csatAvg}/5`,
      hint: `${data.totals.csatResponses}/${data.totals.csatSent} respuestas`,
    },
    {
      label: "Ganado",
      value: formatMxn(data.totals.wonValueCents, { compact: true }),
      hint: `${data.totals.wonCount} ${data.totals.wonCount === 1 ? "trato" : "tratos"}`,
    },
    {
      label: "Perdido",
      value: formatMxn(data.totals.lostValueCents, { compact: true }),
      hint: `${data.totals.lostCount} ${data.totals.lostCount === 1 ? "trato" : "tratos"}`,
    },
  ];

  // Resumen del periodo en una fila (los montos en pesos, sin formato, para
  // que la hoja de cálculo los sume).
  function exportSummary() {
    const t = data.totals;
    const csv = toCsv(
      ["Desde", "Hasta", "Chats nuevos", "Resueltos", "Mensajes", "1a respuesta (min)", "Resolucion (min)", "Abiertos", "Sin asignar", "CSAT", "Ganados", "Ganado (MXN)", "Perdidos", "Perdido (MXN)"],
      [[
        fromKey,
        toKey,
        String(t.newChats),
        String(t.resolved),
        String(t.messages),
        t.avgFirstResponseMinutes == null ? "" : String(t.avgFirstResponseMinutes),
        t.avgResolutionMinutes == null ? "" : String(t.avgResolutionMinutes),
        String(t.open),
        String(t.unassigned),
        t.csatAvg == null ? "" : String(t.csatAvg),
        String(t.wonCount),
        centsToPesos(t.wonValueCents).toFixed(2),
        String(t.lostCount),
        centsToPesos(t.lostValueCents).toFixed(2),
      ]]
    );
    downloadCsv(`reporte-resumen-${fromKey}-${toKey}.csv`, csv);
  }

  function exportAgents() {
    const csv = toCsv(
      ["Agente", "Email", "Nuevos", "Resueltos", "1a respuesta (min)", "Resolucion (min)"],
      data.agents.map((agent) => [
        agent.userName,
        agent.email ?? "",
        String(agent.newChats),
        String(agent.resolved),
        agent.avgFirstResponseMinutes == null ? "" : String(agent.avgFirstResponseMinutes),
        agent.avgResolutionMinutes == null ? "" : String(agent.avgResolutionMinutes),
      ])
    );
    downloadCsv(`reporte-agentes-${fromKey}-${toKey}.csv`, csv);
  }

  function exportChannels() {
    const csv = toCsv(
      ["Canal", "Nuevos", "Resueltos"],
      data.channels.map((channel) => [
        CHANNEL_LABEL[channel.channel] ?? channel.channel,
        String(channel.newChats),
        String(channel.resolved),
      ])
    );
    downloadCsv(`reporte-canales-${fromKey}-${toKey}.csv`, csv);
  }

  return (
    <div className="space-y-6">
      <div className="animate-fade-in-up">
        <PageHeader
          title="Reportes"
          description="Actividad, tiempos de respuesta y carga por agente en un periodo."
          actions={
            <Button variant="secondary" onClick={() => router.push("/estadisticas")}>
              Volver a Estadísticas
            </Button>
          }
        />
      </div>

      <div className="animate-fade-in-up animation-delay-100">
        <LivePanel />
      </div>

      <Card className="animate-fade-in-up animation-delay-100 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-darker" htmlFor="report-from">Desde</label>
            <Input id="report-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="w-40" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-darker" htmlFor="report-to">Hasta</label>
            <Input id="report-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} className="w-40" />
          </div>
          <Button onClick={() => applyRange()}>Aplicar</Button>
          <Button variant="secondary" size="sm" icon={Download} onClick={exportSummary} className="ml-auto order-last">
            Exportar resumen
          </Button>
          <div className="flex flex-wrap gap-1.5">
            <Button variant="secondary" size="sm" onClick={() => applyRange(shiftKey(to, -6), to)}>7 días</Button>
            <Button variant="secondary" size="sm" onClick={() => applyRange(shiftKey(to, -29), to)}>30 días</Button>
            <Button variant="secondary" size="sm" onClick={() => applyRange(shiftKey(to, -89), to)}>90 días</Button>
          </div>
        </div>
      </Card>

      <div className="animate-fade-in-up animation-delay-200">
        <KpiStrip items={kpis} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="animate-fade-in-up animation-delay-300 p-4 lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <SectionHeader eyebrow="Equipo" title="Por agente" />
            <Button variant="secondary" size="sm" icon={Download} onClick={exportAgents} disabled={data.agents.length === 0}>
              Exportar
            </Button>
          </div>
          <p className="mt-1 text-xs text-muted">Haz clic en un agente para ver los chats que explican sus números.</p>
          <Table
            className="mt-3"
            columns={agentColumns}
            rows={data.agents}
            rowKey={(row) => row.userId}
            onRowClick={setAgentModal}
            emptyIcon={Users}
            emptyTitle="Sin actividad en el periodo"
            emptyDescription="Cambia el rango o espera a que el equipo cierre conversaciones."
          />
        </Card>

        <Card className="animate-fade-in-up animation-delay-400 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <SectionHeader eyebrow="Canales" title="Volumen" />
            <Button variant="secondary" size="sm" icon={Download} onClick={exportChannels} disabled={data.channels.length === 0}>
              Exportar
            </Button>
          </div>
          <Table
            className="mt-3"
            columns={channelColumns}
            rows={data.channels}
            rowKey={(row) => row.channel}
            emptyIcon={Users}
            emptyTitle="Sin chats en el periodo"
          />
        </Card>
      </div>

      {bot.chats > 0 && (
        <Card className="animate-fade-in-up animation-delay-300 space-y-3 p-4">
          <SectionHeader eyebrow="Automatización" title="Bot de IA" />
          <p className="text-xs text-muted">
            Chats donde el bot respondió en el periodo. Traspaso = una persona escribió después del bot; resuelto por el bot = se
            resolvió sin que nadie del equipo escribiera.
          </p>
          <KpiStrip
            items={[
              { label: "Chats con bot", value: String(bot.chats), hint: `${bot.botReplies} respuestas del bot` },
              { label: "Resueltos por el bot", value: bot.resolvedByBotPct === null ? "—" : `${bot.resolvedByBotPct}%`, hint: `${bot.resolvedByBot} chats` },
              { label: "Pasaron a una persona", value: bot.handedOffPct === null ? "—" : `${bot.handedOffPct}%`, hint: `${bot.handedOff} chats · ${bot.open} siguen abiertos` },
              {
                label: "CSAT solo bot / con persona",
                value: `${bot.csatBotOnly.avg ?? "—"} / ${bot.csatHandedOff.avg ?? "—"}`,
                hint: `${bot.csatBotOnly.responses} y ${bot.csatHandedOff.responses} respuestas (WhatsApp)`,
              },
            ]}
          />
        </Card>
      )}

      <div className="animate-fade-in-up animation-delay-300">
        <ActivityHeatmap inbound={heatmap.inbound} resolved={heatmap.resolved} timeZone={heatmap.timeZone} />
      </div>

      <Modal layout="drawer"
        open={!!agentModal}
        onClose={() => setAgentModal(null)}
        title={agentModal ? `Chats de ${agentModal.userName}` : "Chats del agente"}
        description={agentModal ? `${agentModal.newChats} nuevos · ${agentModal.resolved} resueltos` : undefined}
        size="lg"
      >
        {agentModal && (
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {agentModal.chats.length === 0 ? (
              <p className="text-sm text-muted">Sin chats en el periodo.</p>
            ) : (
              agentModal.chats.map((chat) => (
                <div key={chat.id} className="rounded-lg border border-border bg-surface-light p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-sm font-medium text-foreground">{chat.contactName}</p>
                    <span className="text-[11px] text-muted">{CHANNEL_LABEL[chat.channel] ?? chat.channel}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">{chat.accountName} · {STATUS_LABEL[chat.status] ?? chat.status}</p>
                  <p className="mt-1 text-[11px] text-muted-darker">
                    Creado {new Date(chat.createdAt).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}
                    {chat.resolvedAt ? ` · Resuelto ${new Date(chat.resolvedAt).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}` : ""}
                  </p>
                </div>
              ))
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
