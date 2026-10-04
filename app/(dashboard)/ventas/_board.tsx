"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
  type Announcements,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { LeadCard, type LeadCardData } from "@/app/components/pipeline/lead-card";
import {
  PIPELINE_STAGES,
  STAGE_LABEL,
  STAGE_COLOR_BORDER,
  STAGE_COLOR_BG,
  STAGE_DOT_COLOR,
} from "@/lib/pipeline/stages";
import { cn } from "@/app/components/ui/cn";
import type { LeadStatus } from "@prisma/client";
import { useToast } from "@/app/components/ui/toast";
import { ContactDrawer } from "@/app/components/whatsapp/contact-drawer";
import { Select } from "@/app/components/ui/select";

export type BoardData = Record<LeadStatus, LeadCardData[]>;

interface PipelineBoardProps {
  initialData: BoardData;
}

function Column({
  stage,
  contacts,
  visibleOnMobile,
  onOpen,
  onStageChange,
}: {
  stage: LeadStatus;
  contacts: LeadCardData[];
  visibleOnMobile: boolean;
  onOpen: (id: string) => void;
  onStageChange: (id: string, stage: LeadStatus) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column-${stage}` });

  return (
    <div data-stage={stage} className={cn(visibleOnMobile ? "flex" : "hidden sm:flex", "min-w-full flex-col sm:min-w-[300px] sm:max-w-[360px] sm:flex-1")}>
      <div className="mb-3 flex items-center gap-2 px-1">
        <span className={cn("h-2.5 w-2.5 rounded-full", STAGE_DOT_COLOR[stage])} />
        <h3 className="text-sm font-semibold text-foreground">
          {STAGE_LABEL[stage]}
        </h3>
        <span className="ml-auto rounded-full bg-surface-light px-2 py-0.5 text-xs tabular-nums text-muted">
          {contacts.length}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "flex flex-1 flex-col gap-3 rounded-xl border p-3 transition-colors min-h-[200px]",
          STAGE_COLOR_BORDER[stage],
          STAGE_COLOR_BG[stage],
          isOver && "ring-2 ring-accent-strong border-accent-strong"
        )}
      >
        {contacts.length === 0 && (
          <div className="flex flex-1 items-center justify-center py-8">
            <p className="text-xs text-muted">Sin leads</p>
          </div>
        )}

        {contacts.map((contact) => (
          <LeadCard key={contact.id} data={contact} onOpen={onOpen} onStageChange={onStageChange} />
        ))}
      </div>
    </div>
  );
}

export function PipelineBoard({ initialData }: PipelineBoardProps) {
  const router = useRouter();
  const { error: toastError } = useToast();
  const [boardData, setBoardData] = useState<BoardData>(initialData);
  const [activeCard, setActiveCard] = useState<LeadCardData | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [stageInView, setStageInView] = useState<LeadStatus>(() => PIPELINE_STAGES.find((stage) => initialData[stage]?.length > 0) ?? PIPELINE_STAGES[0]);
  // Texto de la región viva (sr-only) y tarjeta cuyo selector debe recuperar el
  // foco tras moverla con él (la tarjeta se remonta en otra columna).
  const [statusMessage, setStatusMessage] = useState("");
  const focusAfterMoveRef = useRef<string | null>(null);
  const [prevInitialData, setPrevInitialData] = useState(initialData);
  if (initialData !== prevInitialData) {
    setPrevInitialData(initialData);
    setBoardData(initialData);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  useEffect(() => {
    const id = focusAfterMoveRef.current;
    if (!id) return;
    const select = document.querySelector<HTMLSelectElement>(`select[data-stage-select="${CSS.escape(id)}"]`);
    if (select) {
      focusAfterMoveRef.current = null;
      select.focus();
    }
  }, [boardData, stageInView]);

  const moveCard = useCallback(async (id: string, targetStage: LeadStatus, viaSelect = false) => {
    const sourceStage = PIPELINE_STAGES.find((stage) => boardData[stage]?.some((c) => c.id === id));
    if (!sourceStage || sourceStage === targetStage) return;
    const card = boardData[sourceStage].find((c) => c.id === id)!;
    setBoardData((current) => ({
      ...current,
      [sourceStage]: current[sourceStage].filter((c) => c.id !== id),
      [targetStage]: [...current[targetStage], { ...card, leadStatus: targetStage }],
    }));
    setStageInView(targetStage);
    if (viaSelect) focusAfterMoveRef.current = id;
    try {
      const response = await fetch(`/api/whatsapp/contacts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadStatus: targetStage }),
      });
      if (!response.ok) throw new Error();
      if (viaSelect) setStatusMessage(`${card.name ?? card.remoteJid} movido a ${STAGE_LABEL[targetStage]}`);
      router.refresh();
    } catch {
      setBoardData((current) => ({
        ...current,
        [targetStage]: current[targetStage].filter((c) => c.id !== id),
        [sourceStage]: [...current[sourceStage], card],
      }));
      setStageInView(sourceStage);
      if (viaSelect) focusAfterMoveRef.current = id;
      toastError("No se pudo guardar la nueva etapa");
    }
  }, [boardData, router, toastError]);

  // Anuncios de dnd-kit en español: nombre del lead y etapa, no ids internos.
  const accessibility = useMemo(() => {
    const leadName = (id: string | number) => {
      for (const stage of PIPELINE_STAGES) {
        const card = boardData[stage]?.find((c) => c.id === String(id));
        if (card) return { name: card.name ?? card.remoteJid, stage };
      }
      return { name: "Lead", stage: null as LeadStatus | null };
    };
    const stageOf = (overId: string | number | undefined) => {
      const stage = overId?.toString().replace("column-", "") as LeadStatus | undefined;
      return stage && PIPELINE_STAGES.includes(stage) ? STAGE_LABEL[stage] : null;
    };
    const announcements: Announcements = {
      onDragStart({ active }) {
        const { name, stage } = leadName(active.id);
        return `Levantaste a ${name}${stage ? `, que está en ${STAGE_LABEL[stage]}` : ""}.`;
      },
      onDragOver({ active, over }) {
        const { name } = leadName(active.id);
        const label = stageOf(over?.id);
        return label ? `${name} está sobre la columna ${label}.` : `${name} ya no está sobre ninguna columna.`;
      },
      onDragEnd({ active, over }) {
        const { name } = leadName(active.id);
        const label = stageOf(over?.id);
        return label ? `${name} se soltó en ${label}.` : `${name} se soltó fuera de las columnas y no se movió.`;
      },
      onDragCancel({ active }) {
        const { name, stage } = leadName(active.id);
        return `Se canceló el movimiento. ${name} sigue${stage ? ` en ${STAGE_LABEL[stage]}` : ""}.`;
      },
    };
    return {
      announcements,
      screenReaderInstructions: {
        draggable: "Para mover una tarjeta, presiona Espacio o Enter, usa las flechas para llevarla a otra columna y presiona Espacio o Enter para soltarla. Escape cancela. También puedes cambiar la etapa con el selector de la tarjeta.",
      },
    };
  }, [boardData]);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const { active } = event;
      const stage = active.data.current?.leadStatus as LeadStatus;
      const card = boardData[stage]?.find((c) => c.id === active.id);
      if (card) setActiveCard(card);
    },
    [boardData]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveCard(null);
      if (!over) return;

      const targetStage = over.id.toString().replace("column-", "") as LeadStatus;
      if (!PIPELINE_STAGES.includes(targetStage)) return;

      void moveCard(String(active.id), targetStage);
    },
    [moveCard]
  );

  return (
    <DndContext
      // id fijo: sin él dnd-kit numera su contador distinto en servidor y
      // cliente (aria-describedby="DndDescribedBy-N") y React avisa de un
      // desajuste de hidratación.
      id="pipeline-board"
      sensors={sensors}
      accessibility={accessibility}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div role="status" aria-live="polite" className="sr-only">{statusMessage}</div>
      <div className="mb-3 flex items-center gap-3 sm:hidden">
        <label htmlFor="pipeline-stage" className="text-sm font-medium">Ir a etapa</label>
        <Select id="pipeline-stage" value={stageInView} onChange={(event) => setStageInView(event.target.value as LeadStatus)} className="min-w-0 flex-1">
          {PIPELINE_STAGES.map((stage) => <option key={stage} value={stage}>{STAGE_LABEL[stage]} ({boardData[stage]?.length ?? 0})</option>)}
        </Select>
      </div>
      <div className="flex max-w-full min-w-0 gap-4 overflow-hidden pb-4 sm:overflow-x-auto">
        {PIPELINE_STAGES.map((stage) => (
          <Column key={stage} stage={stage} contacts={boardData[stage] ?? []} visibleOnMobile={stage === stageInView} onOpen={setSelectedContactId} onStageChange={(id, targetStage) => void moveCard(id, targetStage, true)} />
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
