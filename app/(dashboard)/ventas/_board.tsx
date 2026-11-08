"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { LeadCard, type LeadCardData, type StageOption } from "@/app/components/pipeline/lead-card";
import { STAGE_COLUMN_CLASS, stageStation, type StageOutcome } from "@/lib/pipeline/stages";
import { StationMark } from "@/app/components/ui/lead-status";
import { formatMxn } from "@/lib/money";
import { cn } from "@/app/components/ui/cn";
import { useToast } from "@/app/components/ui/toast";
import { ContactDrawer } from "@/app/components/whatsapp/contact-drawer";
import { Select } from "@/app/components/ui/select";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";

export type BoardStage = StageOption & { outcome: StageOutcome; locked: boolean };

export type BoardData = Record<string, LeadCardData[]>;

interface PipelineOption {
  id: string;
  name: string;
  isDefault: boolean;
}

function Column({
  stage,
  index,
  openCount,
  contacts,
  stages,
  visibleOnMobile,
  onOpen,
  onStageChange,
}: {
  stage: BoardStage;
  /** Posición entre las etapas abiertas (para la marca de estación). */
  index: number;
  openCount: number;
  contacts: LeadCardData[];
  stages: StageOption[];
  visibleOnMobile: boolean;
  onOpen: (id: string) => void;
  onStageChange: (id: string, stageId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column-${stage.id}` });
  const totalCents = contacts.reduce((sum, contact) => sum + (contact.dealValueCents ?? 0), 0);
  const withValue = contacts.filter((contact) => contact.dealValueCents !== null).length;
  const station = stageStation(stage.outcome, index, openCount);

  return (
    <div data-stage={stage.id} className={cn(visibleOnMobile ? "flex" : "hidden sm:flex", "min-w-full flex-col sm:min-w-[300px] sm:max-w-[360px] sm:flex-1")}>
      <div className="mb-3 flex items-center gap-2 px-1">
        <StationMark station={station} />
        <h3 className={cn("text-sm font-semibold", station.tone === "lost" ? "text-muted" : station.tone === "won" ? "text-success" : "text-foreground")}>{stage.name}</h3>
        {/* Se recalcula de las tarjetas: al arrastrar, el total se mueve con ellas. */}
        {totalCents > 0 && (
          <span className="text-xs font-semibold tabular-nums text-muted" title={`Suma del valor de ${withValue} ${withValue === 1 ? "trato" : "tratos"}`}>
            {formatMxn(totalCents, { compact: true })}
          </span>
        )}
        <span className="ml-auto rounded-full bg-surface-light px-2 py-0.5 text-xs font-mono tabular-nums text-muted">
          {contacts.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex flex-1 flex-col gap-3 rounded-xl border p-3 transition-colors min-h-[200px]",
          STAGE_COLUMN_CLASS,
          isOver && "ring-2 ring-accent-muted border-accent-muted"
        )}
      >
        {contacts.length === 0 && (
          <div className="flex flex-1 items-center justify-center py-6">
            <p className="text-xs text-muted">Sin leads</p>
          </div>
        )}
        {contacts.map((contact) => (
          <LeadCard key={contact.id} data={contact} stages={stages} onOpen={onOpen} onStageChange={onStageChange} />
        ))}
      </div>
    </div>
  );
}

export function PipelineBoard({
  pipelines,
  pipelineId,
  stages,
  initialData,
}: {
  pipelines: PipelineOption[];
  pipelineId: string;
  stages: BoardStage[];
  initialData: BoardData;
}) {
  const router = useRouter();
  const { error: toastError, success } = useToast();
  const [boardData, setBoardData] = useState<BoardData>(initialData);
  const [activeCard, setActiveCard] = useState<LeadCardData | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [stageInView, setStageInView] = useState(stages.find((stage) => initialData[stage.id]?.length)?.id ?? stages[0]?.id ?? "");
  const [prevInitialData, setPrevInitialData] = useState(initialData);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [stageName, setStageName] = useState("");
  if (initialData !== prevInitialData) {
    setPrevInitialData(initialData);
    setBoardData(initialData);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );
  const options: StageOption[] = stages.map(({ id, name }) => ({ id, name }));
  const current = pipelines.find((item) => item.id === pipelineId);

  const moveCard = useCallback(async (id: string, targetStageId: string) => {
    const sourceStageId = stages.find((stage) => boardData[stage.id]?.some((card) => card.id === id))?.id;
    if (!sourceStageId || sourceStageId === targetStageId) return;
    const card = boardData[sourceStageId].find((item) => item.id === id)!;
    setBoardData((currentBoard) => ({
      ...currentBoard,
      [sourceStageId]: currentBoard[sourceStageId].filter((item) => item.id !== id),
      [targetStageId]: [...(currentBoard[targetStageId] ?? []), { ...card, stageId: targetStageId, closed: stages.find((stage) => stage.id === targetStageId)?.outcome !== "OPEN" }],
    }));
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
      setBoardData((currentBoard) => ({
        ...currentBoard,
        [targetStageId]: (currentBoard[targetStageId] ?? []).filter((item) => item.id !== id),
        [sourceStageId]: [...(currentBoard[sourceStageId] ?? []), card],
      }));
      setStageInView(sourceStageId);
      toastError("No se pudo guardar la nueva etapa");
    }
  }, [boardData, router, stages, toastError]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const stageId = event.active.data.current?.stageId as string | undefined;
    const card = stageId ? boardData[stageId]?.find((item) => item.id === event.active.id) : undefined;
    if (card) setActiveCard(card);
  }, [boardData]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCard(null);
    if (!over) return;
    const targetStageId = over.id.toString().replace("column-", "");
    if (!stages.some((stage) => stage.id === targetStageId)) return;
    void moveCard(String(active.id), targetStageId);
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
        <div className="mb-4 space-y-3 rounded-xl border border-border bg-surface p-4">
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

      <div className="mb-3 flex items-center gap-3 sm:hidden">
        <label htmlFor="pipeline-stage" className="text-sm font-medium">Ir a etapa</label>
        <Select id="pipeline-stage" value={stageInView} onChange={(event) => setStageInView(event.target.value)} className="min-w-0 flex-1">
          {stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name} ({boardData[stage.id]?.length ?? 0})</option>)}
        </Select>
      </div>
      <div className="flex gap-3 overflow-hidden pb-4 sm:overflow-x-auto">
        {stages.map((stage) => (
          <Column
            key={stage.id}
            stage={stage}
            index={stages.filter((s) => s.outcome === "OPEN").findIndex((s) => s.id === stage.id)}
            openCount={stages.filter((s) => s.outcome === "OPEN").length}
            contacts={boardData[stage.id] ?? []}
            stages={options}
            visibleOnMobile={stage.id === stageInView}
            onOpen={setSelectedContactId}
            onStageChange={(id, target) => void moveCard(id, target)}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeCard ? <LeadCard data={activeCard} /> : null}
      </DragOverlay>
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
