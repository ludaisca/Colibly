"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { History, MessageSquare, Pause, Play, Square, RefreshCw } from "lucide-react";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Select } from "@/app/components/ui/select";
import { Drawer } from "@/app/components/ui/drawer";
import { Spinner } from "@/app/components/ui/spinner";
import { EntityList, EntityRow } from "@/app/components/ui/entity-list";
import { useToast } from "@/app/components/ui/toast";
import { RUN_STATUS, formatWhen } from "../../_shared";
import { BackLink } from "@/app/components/ui/back-link";

interface RunRow {
  id: string;
  status: string;
  lastError: string | null;
  startedAt: string;
  endedAt: string | null;
  nextRunAt: string | null;
  version: number;
  chatId: string | null;
  accountId: string | null;
  contact: { id: string; name: string };
}

interface RunDetail {
  id: string;
  status: string;
  automation: { id: string; name: string };
  vars: Record<string, string>;
  lastError: string | null;
  nextRunAt: string | null;
  logs: { id: string; nodeType: string; outcome: string; detail: string; at: string }[];
}

const FILTERS = [
  { value: "", label: "Todas" },
  { value: "ACTIVE,WAITING_DELAY,WAITING_REPLY,PAUSED_BY_AGENT", label: "En curso" },
  { value: "COMPLETED,HANDED_OFF,HANDED_TO_BOT,EXITED_REPLY", label: "Terminadas" },
  { value: "FAILED,EXPIRED", label: "Con problemas" },
  { value: "CANCELLED", label: "Canceladas" },
];

const OUTCOME_DOT: Record<string, string> = {
  ok: "bg-success",
  branch: "bg-accent",
  waiting: "bg-info",
  error: "bg-danger",
  skipped: "bg-muted",
};

export default function AutomationRunsPage() {
  const { id } = useParams<{ id: string }>();
  const { success, error: toastError } = useToast();
  const [filter, setFilter] = useState("");
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [openRun, setOpenRun] = useState<RunRow | null>(null);
  const [detail, setDetail] = useState<RunDetail | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(`/api/automations/${id}/runs${filter ? `?status=${filter}` : ""}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al cargar");
      setRuns(data);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [id, filter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount/filtro; load también refresca manualmente
    load();
  }, [load]);

  const openDetail = useCallback(async (run: RunRow) => {
    setOpenRun(run);
    setDetail(null);
    const res = await fetch(`/api/automations/runs/${run.id}`);
    const data = await res.json();
    if (res.ok) setDetail(data);
  }, []);

  async function act(action: "pause" | "resume" | "cancel") {
    if (!openRun) return;
    const res = await fetch(`/api/automations/runs/${openRun.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toastError(data.error ?? "No se pudo");
    success(action === "pause" ? "Pausada" : action === "resume" ? "Reanudada" : "Terminada");
    await load();
    await openDetail({ ...openRun });
  }

  const live = detail && ["ACTIVE", "WAITING_DELAY", "WAITING_REPLY", "PAUSED_BY_AGENT"].includes(detail.status);

  return (
    <div className="space-y-6">
      <div>
        <BackLink href={`/whatsapp/automatizaciones/${id}`} className="mb-3">Volver al editor</BackLink>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-page-title">Ejecuciones</h1>
          <div className="flex gap-2">
            <Select aria-label="Filtrar" value={filter} onChange={(e) => setFilter(e.target.value)}>
              {FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </Select>
            <Button variant="secondary" icon={RefreshCw} onClick={load} aria-label="Actualizar" />
          </div>
        </div>
      </div>

      <EntityList
        rows={runs}
        rowKey={(r) => r.id}
        loading={loading}
        error={fetchError}
        onRetry={load}
        emptyIcon={History}
        emptyTitle="Sin ejecuciones"
        emptyDescription="Cuando la automatización se dispare, cada contacto aparece aquí con su recorrido paso a paso."
        onRowClick={openDetail}
        renderRow={(r) => (
          <EntityRow
            title={r.contact.name}
            subtitle={r.lastError ? r.lastError : `Inició ${formatWhen(r.startedAt)}${r.endedAt ? ` · terminó ${formatWhen(r.endedAt)}` : ""}`}
            badges={
              <>
                <Badge size="sm" tone={RUN_STATUS[r.status]?.tone ?? "neutral"}>{RUN_STATUS[r.status]?.label ?? r.status}</Badge>
                <Badge size="sm">v{r.version}</Badge>
              </>
            }
            meta={r.nextRunAt ? `Sigue ${formatWhen(r.nextRunAt)}` : undefined}
          />
        )}
      />

      <Drawer open={!!openRun} onClose={() => setOpenRun(null)} side="right" width="w-full sm:w-[460px]" title={openRun?.contact.name}>
        <div className="space-y-4 p-4">
          {!detail ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={RUN_STATUS[detail.status]?.tone ?? "neutral"}>{RUN_STATUS[detail.status]?.label ?? detail.status}</Badge>
                {detail.nextRunAt && <span className="text-xs text-muted">Sigue {formatWhen(detail.nextRunAt)}</span>}
              </div>
              {detail.lastError && <p className="rounded-lg bg-danger-bg p-2 text-xs text-danger">{detail.lastError}</p>}
              <div className="flex flex-wrap gap-2">
                {openRun?.chatId && openRun.accountId && (
                  <Button size="sm" variant="secondary" icon={MessageSquare} href={`/whatsapp/chat/${openRun.accountId}/${openRun.chatId}`}>
                    Abrir chat
                  </Button>
                )}
                {live && detail.status !== "PAUSED_BY_AGENT" && <Button size="sm" variant="secondary" icon={Pause} onClick={() => act("pause")}>Pausar</Button>}
                {detail.status === "PAUSED_BY_AGENT" && <Button size="sm" variant="secondary" icon={Play} onClick={() => act("resume")}>Reanudar</Button>}
                {live && <Button size="sm" variant="danger" icon={Square} onClick={() => act("cancel")}>Terminar</Button>}
              </div>
              <ol className="relative space-y-3 border-l border-border pl-5">
                {detail.logs.map((l) => (
                  <li key={l.id} className="relative">
                    <span className={`absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full ${OUTCOME_DOT[l.outcome] ?? "bg-muted"}`} />
                    <p className="text-sm text-foreground">{l.detail}</p>
                    <p className="text-micro text-muted tabular-nums">{formatWhen(l.at)}</p>
                  </li>
                ))}
              </ol>
              {Object.keys(detail.vars).length > 0 && (
                <div>
                  <p className="mb-1 text-eyebrow font-medium text-muted-darker">Variables</p>
                  <dl className="space-y-1 text-xs">
                    {Object.entries(detail.vars).map(([k, v]) => (
                      <div key={k} className="flex gap-2">
                        <dt className="font-mono text-muted">{k}</dt>
                        <dd className="break-all text-foreground">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
            </>
          )}
        </div>
      </Drawer>
    </div>
  );
}
