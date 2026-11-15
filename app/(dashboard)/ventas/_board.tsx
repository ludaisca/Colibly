"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { LeadCard, type LeadCardData, type StageOption } from "@/app/components/pipeline/lead-card";
import { type StageOutcome } from "@/lib/pipeline/stages";
import { applyMove, dropTargetStage, revertMove } from "@/lib/pipeline/board-move";
import { ContactCreateModal } from "@/app/components/whatsapp/contact-create-modal";
import { loadContactAccounts, type ContactAccountOption } from "@/app/components/whatsapp/contact-accounts";
import { formatMxn } from "@/lib/money";
import { cn } from "@/app/components/ui/cn";
import { useToast } from "@/app/components/ui/toast";
import { ContactDrawer } from "@/app/components/whatsapp/contact-drawer";
import { Select } from "@/app/components/ui/select";
import { Button } from "@/app/components/ui/button";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Input } from "@/app/components/ui/input";

export type BoardStage = StageOption & { outcome: StageOutcome; locked: boolean };

export type BoardData = Record<string, LeadCardData[]>;

/** Total de cada columna (de la base): la columna solo trae una página de tarjetas. */
export type StageTotals = Record<string, { count: number; valueCents: number; partialValue?: boolean }>;

interface PipelineOption {
  id: string;
  name: string;
  isDefault: boolean;
}

// Punto de color de la etapa: las abiertas toman las series de gráficas en
// orden; ganada en verde, perdida en gris.
const OPEN_DOT = ["bg-[var(--chart-1)]", "bg-[var(--chart-2)]", "bg-[var(--chart-3)]", "bg-[var(--chart-4)]", "bg-[var(--chart-5)]"];
function stageDotClass(outcome: StageOutcome, openIndex: number): string {
  if (outcome === "WON") return "bg-success";
  if (outcome === "LOST") return "bg-subtle";
  return OPEN_DOT[Math.max(0, openIndex) % OPEN_DOT.length];
}

// Botón de etapa del teléfono. También recibe tarjetas: ahí solo se ve una
// columna, así que una tarjeta levantada (pulsación larga) se suelta sobre la
// etapa destino.
function StagePill({ stage, active, count, onSelect }: { stage: BoardStage; active: boolean; count: number; onSelect: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `tab-${stage.id}` });
  return (
    <button
      ref={setNodeRef}
      type="button"
      aria-pressed={active}
      data-stage-tab={stage.id}
      onClick={onSelect}
      className={cn(
        "-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium",
        active ? "border-accent text-foreground" : "border-transparent text-muted",
        isOver && "bg-accent-subtle text-foreground"
      )}
    >
      {stage.name} <span className="tabular-nums text-muted">{count.toLocaleString("es-MX")}</span>
    </button>
  );
}

function Column({
  stage,
  index,
  contacts,
  total,
  loadingMore,
  onLoadMore,
  stages,
  visibleOnMobile,
  dragging,
  onOpen,
  onStageChange,
  onAdd,
}: {
  stage: BoardStage;
  total: { count: number; valueCents: number; partialValue?: boolean };
  loadingMore: boolean;
  onLoadMore: () => void;
  /** Posición entre las etapas abiertas (color del punto). */
  index: number;
  contacts: LeadCardData[];
  stages: StageOption[];
  visibleOnMobile: boolean;
  /** Hay una tarjeta en el aire: las columnas vacías dicen "Suelta aquí". */
  dragging: boolean;
  onOpen: (id: string) => void;
  onStageChange: (id: string, stageId: string) => void;
  onAdd: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column-${stage.id}` });
  const remaining = Math.max(total.count - contacts.length, 0);

  return (
    <div data-stage={stage.id} className={cn(visibleOnMobile ? "flex" : "hidden sm:flex", "min-w-full flex-col sm:min-w-[260px] sm:max-w-[340px] sm:flex-1 lg:min-w-[220px]")}>
      <div className="mb-2 flex items-center gap-2 px-1">
        <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", stageDotClass(stage.outcome, index))} />
        <h3 className="min-w-0 truncate text-sm font-semibold text-foreground">{stage.name}</h3>
        <span className="font-display text-base font-semibold tabular-nums text-muted">{total.count.toLocaleString("es-MX")}</span>
        {/* Total de la base; al arrastrar, el tablero lo ajusta con la tarjeta. */}
        {total.valueCents > 0 && (
          <span className="ml-auto font-display text-base font-semibold tabular-nums text-foreground" title={total.partialValue ? "Suma del valor de los tratos mostrados" : "Suma del valor de los tratos de esta etapa"}>
            {formatMxn(total.valueCents, { compact: true })}
          </span>
        )}
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-[200px] flex-1 flex-col gap-2 rounded-lg bg-surface-light p-2 transition-colors duration-fast",
          isOver && "ring-2 ring-accent-muted"
        )}
      >
        {contacts.length === 0 && remaining === 0 && dragging && (
          <p className="flex flex-1 items-center justify-center py-6 text-xs text-muted">Suelta aquí</p>
        )}
        {contacts.map((contact) => (
          <LeadCard key={contact.id} data={contact} stages={stages} onOpen={onOpen} onStageChange={onStageChange} />
        ))}
        {remaining > 0 && (
          <Button type="button" variant="ghost" size="sm" className="w-full" disabled={loadingMore} onClick={onLoadMore}>
            {loadingMore ? "Cargando…" : `Cargar más (${remaining.toLocaleString("es-MX")})`}
          </Button>
        )}
        <Button type="button" variant="ghost" size="sm" icon={Plus} className="mt-auto w-full justify-start" onClick={onAdd}>
          Agregar trato
        </Button>
      </div>
    </div>
  );
}

export function PipelineBoard({
  pipelines,
  pipelineId,
  stages,
  initialData,
  initialTotals,
  onlyStaleStageId,
}: {
  pipelines: PipelineOption[];
  pipelineId: string;
  stages: BoardStage[];
  initialData: BoardData;
  initialTotals: StageTotals;
  /** Columna filtrada a los leads detenidos (?detenidos=1). */
  onlyStaleStageId: string | null;
}) {
  const router = useRouter();
  const { error: toastError, success } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState({ left: false, right: false });

  // ¿Hay etapas fuera de la vista? Se recalcula al desplazar y al cambiar de tamaño.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setOverflow({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [stages.length]);

  function scrollByColumns(direction: 1 | -1) {
    const el = scrollRef.current;
    if (el) el.scrollBy({ left: direction * Math.max(220, el.clientWidth * 0.8), behavior: "smooth" });
  }
  const [boardData, setBoardData] = useState<BoardData>(initialData);
  const [activeCard, setActiveCard] = useState<LeadCardData | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [stageInView, setStageInView] = useState(stages.find((stage) => initialData[stage.id]?.length)?.id ?? stages[0]?.id ?? "");
  const [prevInitialData, setPrevInitialData] = useState(initialData);
  const [totals, setTotals] = useState<StageTotals>(initialTotals);
  const [loadingStage, setLoadingStage] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [stageName, setStageName] = useState("");
  if (initialData !== prevInitialData) {
    setPrevInitialData(initialData);
    setBoardData(initialData);
    setTotals(initialTotals);
  }

  // Toda la tarjeta se arrastra: con el mouse tras 5 px (un clic abre la
  // ficha) y en pantallas táctiles con una pulsación de 200 ms (deslizar el dedo
  // desplaza la columna). Mouse y Touch por separado: un PointerSensor también
  // captura el toque y arrancaría el arrastre a los 5 px. Con teclado, Espacio
  // levanta y suelta; Enter abre la ficha (lead-card.tsx).
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] } })
  );
  const options: StageOption[] = stages.map(({ id, name }) => ({ id, name }));
  const current = pipelines.find((item) => item.id === pipelineId);

  // Arrastre y menú ⋯ usan la misma acción: optimista, guarda y, si falla,
  // deshace (lib/pipeline/board-move.ts, con pruebas). El movimiento parte del
  // estado más reciente (refs, no el cierre del render) y una tarjeta con un
  // guardado en curso no se vuelve a mover: dos movimientos rápidos no pueden
  // partir de un tablero viejo ni duplicar la tarjeta al deshacer.
  const boardRef = useRef(boardData);
  const totalsRef = useRef(totals);
  const savingRef = useRef(new Set<string>());
  useEffect(() => {
    boardRef.current = boardData;
    totalsRef.current = totals;
  }, [boardData, totals]);

  const moveCard = useCallback(async (id: string, targetStageId: string) => {
    if (savingRef.current.has(id)) return;
    const move = applyMove(boardRef.current, totalsRef.current, id, targetStageId, stages);
    if (!move) return;
    savingRef.current.add(id);
    boardRef.current = move.board;
    totalsRef.current = move.totals;
    setBoardData(move.board);
    setTotals(move.totals);
    setStageInView(targetStageId);
    try {
      const response = await fetch(`/api/whatsapp/contacts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipelineStageId: targetStageId }),
      });
      if (!response.ok) throw new Error();
      router.refresh();
    } catch {
      // Se deshace sobre el estado actual (pudo cambiar mientras tanto).
      const reverted = revertMove(boardRef.current, totalsRef.current, move);
      boardRef.current = reverted.board;
      totalsRef.current = reverted.totals;
      setBoardData(reverted.board);
      setTotals(reverted.totals);
      setStageInView(move.from);
      toastError("No se pudo guardar la nueva etapa");
    } finally {
      savingRef.current.delete(id);
    }
  }, [router, stages, toastError]);

  // "Agregar trato": alta de contacto y, ya creado, a la columna elegida.
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<ContactAccountOption[] | null>(null);
  const openAdd = useCallback(async (stageId: string) => {
    if (!accounts) {
      try {
        setAccounts(await loadContactAccounts());
      } catch {
        setAccounts([]);
      }
    }
    setAddingTo(stageId);
  }, [accounts]);
  const placeNewContact = useCallback(async (contactId: string) => {
    const stageId = addingTo;
    setAddingTo(null);
    if (stageId) {
      const response = await fetch(`/api/whatsapp/contacts/${contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipelineStageId: stageId }),
      }).catch(() => null);
      if (!response?.ok) {
        const stageName = stages.find((stage) => stage.id === stageId)?.name ?? "la etapa";
        toastError(`El contacto se creó, pero no se pudo poner en «${stageName}»`);
      }
    }
    router.refresh();
  }, [addingTo, router, stages, toastError]);

  // «Cargar más»: la siguiente página de la columna (lo ya cargado es el skip).
  const loadMore = useCallback(async (stageId: string) => {
    setLoadingStage(stageId);
    try {
      const params = new URLSearchParams({ skip: String(boardData[stageId]?.length ?? 0) });
      if (stageId === onlyStaleStageId) params.set("detenidos", "1");
      const response = await fetch(`/api/pipelines/${pipelineId}/stages/${stageId}/cards?${params}`);
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(body.cards)) throw new Error(typeof body.error === "string" ? body.error : "No se pudieron cargar más leads");
      setBoardData((currentBoard) => {
        const loaded = currentBoard[stageId] ?? [];
        const seen = new Set(loaded.map((card) => card.id));
        return { ...currentBoard, [stageId]: [...loaded, ...(body.cards as LeadCardData[]).filter((card) => !seen.has(card.id))] };
      });
    } catch (error) {
      toastError(error instanceof Error ? error.message : "No se pudieron cargar más leads");
    } finally {
      setLoadingStage(null);
    }
  }, [boardData, onlyStaleStageId, pipelineId, toastError]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const stageId = event.active.data.current?.stageId as string | undefined;
    const card = stageId ? boardData[stageId]?.find((item) => item.id === event.active.id) : undefined;
    if (card) setActiveCard(card);
  }, [boardData]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveCard(null);
    const targetStageId = dropTargetStage(event.over?.id, stages);
    if (targetStageId) void moveCard(String(event.active.id), targetStageId);
  }, [moveCard, stages]);

  async function createPipeline() {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const response = await fetch("/api/pipelines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        toastError(typeof body.error === "string" ? body.error : "No se pudo crear el embudo");
        return;
      }
      setNewName("");
      success("Embudo creado");
      router.push(`/ventas?pipeline=${body.id}`);
      router.refresh();
    } finally {
      setCreating(false);
    }
  }

  async function addStage() {
    const name = stageName.trim();
    if (!name) return;
    const response = await fetch(`/api/pipelines/${pipelineId}/stages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, outcome: "OPEN" }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      toastError(typeof body.error === "string" ? body.error : "No se pudo agregar la etapa");
      return;
    }
    setStageName("");
    success("Etapa agregada");
    router.refresh();
  }

  async function renameStage(stageId: string, name: string) {
    const response = await fetch(`/api/pipelines/${pipelineId}/stages/${stageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      toastError(typeof body.error === "string" ? body.error : "No se pudo renombrar");
      return;
    }
    router.refresh();
  }

  async function removeStage(stageId: string) {
    const response = await fetch(`/api/pipelines/${pipelineId}/stages/${stageId}`, { method: "DELETE" });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      toastError(typeof body.error === "string" ? body.error : "No se pudo quitar la etapa");
      return;
    }
    router.refresh();
  }

  async function removePipeline() {
    const response = await fetch(`/api/pipelines/${pipelineId}`, { method: "DELETE" });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      toastError(typeof body.error === "string" ? body.error : "No se pudo eliminar el embudo");
      return;
    }
    router.push("/ventas");
    router.refresh();
  }

  return (
    <DndContext id="pipeline-board" sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <label htmlFor="pipeline-picker" className="mb-1 block text-xs font-medium text-muted-darker">Embudo</label>
          <Select
            id="pipeline-picker"
            value={pipelineId}
            onChange={(event) => router.push(`/ventas?pipeline=${event.target.value}`)}
          >
            {pipelines.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </Select>
        </div>
        {/* Crear embudos y editar etapas viven en el panel: arriba solo el
            embudo y su botón (en el teléfono ocupaban media pantalla). */}
        <Button type="button" variant="secondary" aria-expanded={editing} onClick={() => setEditing((open) => !open)}>
          {editing ? "Cerrar" : "Editar embudo"}
        </Button>
      </div>

      {editing && (
        <div className="mb-4 space-y-3 rounded-lg border border-border bg-surface p-4">
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void createPipeline();
            }}
          >
            <Input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Nombre del nuevo embudo"
              aria-label="Nombre del nuevo embudo"
              maxLength={60}
              className="min-w-0 flex-1"
            />
            <Button type="submit" disabled={creating || !newName.trim()}>Crear embudo</Button>
          </form>
          <p className="border-t border-border pt-3 text-sm text-muted-darker">
            {current?.name}. Las etapas del embudo principal que corresponden a un estado del lead se pueden renombrar.
          </p>
          <ul className="space-y-2">
            {stages.map((stage) => (
              <li key={stage.id} className="flex items-center gap-2">
                <Input
                  defaultValue={stage.name}
                  aria-label={`Nombre de ${stage.name}`}
                  maxLength={40}
                  onBlur={(event) => {
                    const name = event.target.value.trim();
                    if (name && name !== stage.name) void renameStage(stage.id, name);
                  }}
                  className="min-w-0 flex-1"
                />
                {!stage.locked && (
                  <Button type="button" variant="link-danger" size="sm" onClick={() => void removeStage(stage.id)}>
                    Quitar
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void addStage();
            }}
          >
            <Input
              value={stageName}
              onChange={(event) => setStageName(event.target.value)}
              placeholder="Nueva etapa"
              aria-label="Nueva etapa"
              maxLength={40}
              className="min-w-0 flex-1"
            />
            <Button type="submit" variant="secondary" disabled={!stageName.trim()}>Agregar</Button>
          </form>
          {current && !current.isDefault && (
            <Button type="button" variant="link-danger" size="sm" className="self-start" onClick={() => void removePipeline()}>
              Eliminar este embudo
            </Button>
          )}
        </div>
      )}

      {/* Teléfono: una columna a la vez; botones de etapa (aria-pressed). */}
      <div role="group" aria-label="Etapa visible" className="-mx-1 mb-3 flex gap-1 overflow-x-auto border-b border-border scrollbar-none sm:hidden">
        {stages.map((stage) => (
          <StagePill
            key={stage.id}
            stage={stage}
            active={stage.id === stageInView}
            count={totals[stage.id]?.count ?? boardData[stage.id]?.length ?? 0}
            onSelect={() => setStageInView(stage.id)}
          />
        ))}
      </div>
      <div className="relative">
      <div ref={scrollRef} className="flex gap-3 overflow-hidden pb-4 sm:overflow-x-auto">
        {stages.map((stage) => (
          <Column
            key={stage.id}
            stage={stage}
            index={stages.filter((s) => s.outcome === "OPEN").findIndex((s) => s.id === stage.id)}
            contacts={boardData[stage.id] ?? []}
            total={totals[stage.id] ?? { count: boardData[stage.id]?.length ?? 0, valueCents: 0 }}
            loadingMore={loadingStage === stage.id}
            onLoadMore={() => void loadMore(stage.id)}
            stages={options}
            visibleOnMobile={stage.id === stageInView}
            dragging={activeCard !== null}
            onOpen={setSelectedContactId}
            onStageChange={(id, target) => void moveCard(id, target)}
            onAdd={() => void openAdd(stage.id)}
          />
        ))}
      </div>
      {/* Con más etapas de las que caben: degradado en el borde, flechas y una pista de que se desliza. */}
      {overflow.right && <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 hidden w-12 bg-gradient-to-l from-background to-transparent sm:block" />}
      {overflow.left && <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 hidden w-12 bg-gradient-to-r from-background to-transparent sm:block" />}
      {(overflow.left || overflow.right) && (
        <div className="hidden items-center justify-end gap-2 pb-1 text-xs text-muted sm:flex">
          {overflow.right && <span>Desliza para ver más etapas</span>}
          <Button type="button" variant="secondary" size="sm" icon={ChevronLeft} aria-label="Etapas anteriores" disabled={!overflow.left} onClick={() => scrollByColumns(-1)} />
          <Button type="button" variant="secondary" size="sm" icon={ChevronRight} aria-label="Más etapas" disabled={!overflow.right} onClick={() => scrollByColumns(1)} />
        </div>
      )}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeCard ? <LeadCard data={activeCard} overlay /> : null}
      </DragOverlay>
      {addingTo && accounts && (
        <ContactCreateModal open onClose={() => setAddingTo(null)} accounts={accounts} onCreated={(id) => void placeNewContact(id)} />
      )}
      {selectedContactId && (
        <ContactDrawer
          contactId={selectedContactId}
          onClose={() => setSelectedContactId(null)}
          onUpdated={() => router.refresh()}
        />
      )}
    </DndContext>
  );
}
