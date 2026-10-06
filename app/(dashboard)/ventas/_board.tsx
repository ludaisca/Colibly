"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { DealCard } from "@/app/components/pipeline/deal-card";
import { cn } from "@/app/components/ui/cn";
import { Select } from "@/app/components/ui/select";
import { Input } from "@/app/components/ui/input";
import { Button } from "@/app/components/ui/button";
import { Modal } from "@/app/components/ui/modal";
import { FormField } from "@/app/components/ui/form-field";
import { useToast } from "@/app/components/ui/toast";
import { ContactDrawer } from "@/app/components/whatsapp/contact-drawer";
import { stageClasses } from "@/lib/pipeline/stage-colors";
import { formatMoney } from "@/lib/pipeline/format";
import type { BoardColumn, BoardDeal, BoardResponse, BoardStage } from "@/lib/pipeline/types";

interface PipelineSummary {
  id: string;
  name: string;
}

interface LossReason {
  id: string;
  name: string;
}

function Column({
  column,
  currency,
  stages,
  visibleOnMobile,
  loadingMore,
  onOpenContact,
  onMove,
  onLoadMore,
}: {
  column: BoardColumn;
  currency: string;
  stages: BoardStage[];
  visibleOnMobile: boolean;
  loadingMore: boolean;
  onOpenContact: (contactId: string) => void;
  onMove: (dealId: string, stageId: string) => void;
  onLoadMore: (stageId: string) => void;
}) {
  const { stage } = column;
  const { setNodeRef, isOver } = useDroppable({ id: `column-${stage.id}` });
  const tone = stageClasses(stage.color);

  return (
    <div data-stage={stage.id} className={cn(visibleOnMobile ? "flex" : "hidden sm:flex", "min-w-full flex-col sm:min-w-[300px] sm:max-w-[360px] sm:flex-1")}>
      <div className="mb-3 px-1">
        <div className="flex items-center gap-2">
          <span className={cn("h-2.5 w-2.5 rounded-full", tone.dot)} />
          <h3 className="text-sm font-semibold text-foreground">{stage.name}</h3>
          <span className="ml-auto rounded-full bg-surface-light px-2 py-0.5 font-mono text-xs tabular-nums text-muted">{column.count}</span>
        </div>
        <p className="mt-1 font-mono text-xs tabular-nums text-muted-darker">
          {formatMoney(column.amount, currency)}
          {stage.outcome === "OPEN" && column.weighted !== column.amount && <span title="Ponderado por probabilidad"> · {formatMoney(column.weighted, currency)} pond.</span>}
        </p>
      </div>

      <div
        ref={setNodeRef}
        className={cn("flex min-h-[200px] flex-1 flex-col gap-3 rounded-xl border p-3 transition-colors", tone.border, tone.bg, isOver && "border-accent-muted ring-2 ring-accent-muted")}
      >
        {column.items.length === 0 && (
          <div className="flex flex-1 items-center justify-center py-8">
            <p className="text-xs text-muted">Sin negocios</p>
          </div>
        )}
        {column.items.map((deal) => (
          <DealCard key={deal.id} deal={deal} currency={currency} stages={stages} onOpenContact={onOpenContact} onMove={onMove} />
        ))}
        {column.nextCursor && (
          <Button variant="ghost" size="sm" loading={loadingMore} onClick={() => onLoadMore(stage.id)}>
            Cargar más ({column.count - column.items.length})
          </Button>
        )}
      </div>
    </div>
  );
}

function boardUrl(pipelineId: string, owner: string, q: string) {
  const p = new URLSearchParams({ pipelineId });
  if (owner) p.set("ownerId", owner);
  if (q) p.set("q", q);
  return `/api/crm/deals/board?${p.toString()}`;
}

export function PipelineBoard({ initialBoard }: { initialBoard: BoardResponse }) {
  const { error: toastError, success } = useToast();
  const [board, setBoard] = useState<BoardResponse>(initialBoard);
  const [pipelines, setPipelines] = useState<PipelineSummary[]>([{ id: initialBoard.pipeline.id, name: initialBoard.pipeline.name }]);
  const [owner, setOwner] = useState("");
  const [query, setQuery] = useState("");
  const [activeDeal, setActiveDeal] = useState<BoardDeal | null>(null);
  const [contactId, setContactId] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState<string | null>(null);
  const [stageInView, setStageInView] = useState<string>(() => initialBoard.columns.find((c) => c.items.length > 0)?.stage.id ?? initialBoard.columns[0]?.stage.id ?? "");
  const [lost, setLost] = useState<{ deal: BoardDeal; stageId: string } | null>(null);
  const [lossReasons, setLossReasons] = useState<LossReason[] | null>(null);
  const [reasonId, setReasonId] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const firstLoad = useRef(true);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor));
  const stages = board.columns.map((c) => c.stage);

  useEffect(() => {
    fetch("/api/crm/pipelines")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setPipelines(d.items.map((p: PipelineSummary) => ({ id: p.id, name: p.name }))))
      .catch(() => undefined);
  }, []);

  const reload = useCallback(
    async (pipelineId: string, ownerFilter: string, q: string) => {
      try {
        const res = await fetch(boardUrl(pipelineId, ownerFilter, q));
        if (!res.ok) throw new Error();
        const next: BoardResponse = await res.json();
        setBoard(next);
        setStageInView((cur) => (next.columns.some((c) => c.stage.id === cur) ? cur : (next.columns[0]?.stage.id ?? "")));
      } catch {
        toastError("No se pudo cargar el pipeline");
      }
    },
    [toastError]
  );

  // Filtros: recarga (la búsqueda con una pausa para no consultar por tecla).
  useEffect(() => {
    if (firstLoad.current) {
      firstLoad.current = false;
      return;
    }
    const t = setTimeout(() => void reload(board.pipeline.id, owner, query), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, query]);

  async function loadMore(stageId: string) {
    const column = board.columns.find((c) => c.stage.id === stageId);
    if (!column?.nextCursor) return;
    setLoadingMore(stageId);
    try {
      const p = new URLSearchParams({ stageId, cursor: column.nextCursor });
      if (owner) p.set("ownerId", owner);
      if (query) p.set("q", query);
      const res = await fetch(`/api/crm/deals/board/column?${p.toString()}`);
      if (!res.ok) throw new Error();
      const page: { items: BoardDeal[]; nextCursor: string | null } = await res.json();
      setBoard((cur) => ({
        ...cur,
        columns: cur.columns.map((c) =>
          c.stage.id === stageId
            ? { ...c, items: [...c.items, ...page.items.filter((d) => !c.items.some((x) => x.id === d.id))], nextCursor: page.nextCursor }
            : c
        ),
      }));
    } catch {
      toastError("No se pudieron cargar más negocios");
    } finally {
      setLoadingMore(null);
    }
  }

  // Aplica en el tablero el resultado de mover un negocio (totales incluidos).
  function applyMove(from: BoardDeal, to: BoardDeal) {
    setBoard((cur) => ({
      ...cur,
      columns: cur.columns.map((c) => {
        if (c.stage.id === from.stageId) {
          return { ...c, items: c.items.filter((d) => d.id !== from.id), count: Math.max(0, c.count - 1), amount: c.amount - from.amount, weighted: c.weighted - from.weightedAmount };
        }
        if (c.stage.id === to.stageId) {
          return { ...c, items: [to, ...c.items], count: c.count + 1, amount: c.amount + to.amount, weighted: c.weighted + to.weightedAmount };
        }
        return c;
      }),
    }));
  }

  async function submitMove(deal: BoardDeal, stageId: string, extra?: { lostReasonId: string; lostNote: string }) {
    setSaving(true);
    try {
      const res = await fetch(`/api/crm/deals/${deal.id}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stageId, expectedVersion: deal.version, ...(extra ? { lostReasonId: extra.lostReasonId, lostNote: extra.lostNote || null } : {}) }),
      });
      const body = await res.json();
      if (!res.ok) {
        // Alguien más lo movió o editó: se vuelve a leer el tablero.
        if (body.code === "version_conflict") void reload(board.pipeline.id, owner, query);
        throw new Error(body.error ?? "No se pudo mover el negocio");
      }
      applyMove(deal, { ...deal, ...body, person: deal.person, company: deal.company, owner: deal.owner });
      setStageInView(stageId);
      return true;
    } catch (e) {
      toastError(e instanceof Error ? e.message : "No se pudo mover el negocio");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function requestMove(dealId: string, stageId: string) {
    const deal = board.columns.flatMap((c) => c.items).find((d) => d.id === dealId);
    const target = stages.find((s) => s.id === stageId);
    if (!deal || !target || deal.stageId === stageId) return;
    if (target.outcome === "LOST") {
      // Perder exige motivo: se pregunta antes de mover.
      if (!lossReasons) {
        fetch("/api/crm/loss-reasons")
          .then((r) => r.json())
          .then((d) => setLossReasons(d.items))
          .catch(() => toastError("No se pudieron cargar los motivos de pérdida"));
      }
      setReasonId("");
      setNote("");
      setLost({ deal, stageId });
      return;
    }
    const ok = await submitMove(deal, stageId);
    if (ok && target.outcome === "WON") success("¡Negocio ganado!");
  }

  function handleDragStart(event: DragStartEvent) {
    const deal = board.columns.flatMap((c) => c.items).find((d) => d.id === event.active.id);
    if (deal) setActiveDeal(deal);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDeal(null);
    if (!event.over) return;
    const stageId = event.over.id.toString().replace("column-", "");
    if (stages.some((s) => s.id === stageId)) void requestMove(String(event.active.id), stageId);
  }

  const lostStage = lost ? stages.find((s) => s.id === lost.stageId) : null;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select
          aria-label="Pipeline"
          value={board.pipeline.id}
          onChange={(e) => void reload(e.target.value, owner, query)}
          className="min-w-44"
        >
          {pipelines.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Select>
        <Select aria-label="Responsable" value={owner} onChange={(e) => setOwner(e.target.value)} className="min-w-40">
          <option value="">Todos los negocios</option>
          <option value="me">Solo los míos</option>
          <option value="none">Sin responsable</option>
        </Select>
        <Input aria-label="Buscar negocios" placeholder="Buscar por título, contacto o empresa" value={query} onChange={(e) => setQuery(e.target.value)} className="min-w-56 flex-1 sm:max-w-sm" />
      </div>

      <DndContext
        // id fijo: sin él dnd-kit numera su contador distinto en servidor y
        // cliente (aria-describedby="DndDescribedBy-N") y React avisa de un
        // desajuste de hidratación.
        id="pipeline-board"
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="mb-3 flex items-center gap-3 sm:hidden">
          <label htmlFor="pipeline-stage" className="text-sm font-medium">Ir a etapa</label>
          <Select id="pipeline-stage" value={stageInView} onChange={(e) => setStageInView(e.target.value)} className="min-w-0 flex-1">
            {board.columns.map((c) => (
              <option key={c.stage.id} value={c.stage.id}>{c.stage.name} ({c.count})</option>
            ))}
          </Select>
        </div>
        <div className="flex gap-4 overflow-hidden pb-4 sm:overflow-x-auto">
          {board.columns.map((column) => (
            <Column
              key={column.stage.id}
              column={column}
              currency={board.currency}
              stages={stages}
              visibleOnMobile={column.stage.id === stageInView}
              loadingMore={loadingMore === column.stage.id}
              onOpenContact={setContactId}
              onMove={(id, stageId) => void requestMove(id, stageId)}
              onLoadMore={(id) => void loadMore(id)}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>{activeDeal ? <DealCard deal={activeDeal} currency={board.currency} /> : null}</DragOverlay>
      </DndContext>

      {contactId && <ContactDrawer contactId={contactId} onClose={() => setContactId(null)} onUpdated={() => void reload(board.pipeline.id, owner, query)} />}

      <Modal
        open={!!lost}
        onClose={() => !saving && setLost(null)}
        title="Perder negocio"
        description={lost ? `${lost.deal.title} pasará a “${lostStage?.name}”.` : undefined}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setLost(null)} disabled={saving}>Cancelar</Button>
            <Button
              loading={saving}
              disabled={!reasonId}
              onClick={async () => {
                if (!lost) return;
                if (await submitMove(lost.deal, lost.stageId, { lostReasonId: reasonId, lostNote: note })) setLost(null);
              }}
            >
              Perder negocio
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormField label="Motivo" required>
            {(id) => (
              <Select id={id} value={reasonId} onChange={(e) => setReasonId(e.target.value)}>
                <option value="">Elige un motivo</option>
                {(lossReasons ?? []).map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField label="Nota (opcional)">
            {(id) => <Input id={id} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Qué pasó" />}
          </FormField>
        </div>
      </Modal>
    </>
  );
}
