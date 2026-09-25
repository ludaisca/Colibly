"use client";

import { useState, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
  PointerSensor,
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

export type BoardData = Record<LeadStatus, LeadCardData[]>;

interface PipelineBoardProps {
  initialData: BoardData;
}

function Column({
  stage,
  contacts,
}: {
  stage: LeadStatus;
  contacts: LeadCardData[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column-${stage}` });

  return (
    <div className="flex min-w-[300px] max-w-[360px] flex-1 flex-col">
      <div className="mb-3 flex items-center gap-2 px-1">
        <span className={cn("h-2.5 w-2.5 rounded-full", STAGE_DOT_COLOR[stage])} />
        <h3 className="text-sm font-semibold text-foreground">
          {STAGE_LABEL[stage]}
        </h3>
        <span className="ml-auto rounded-full bg-surface-light px-2 py-0.5 text-xs font-mono tabular-nums text-muted-darker">
          {contacts.length}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "flex flex-1 flex-col gap-3 rounded-xl border p-3 transition-colors min-h-[200px]",
          STAGE_COLOR_BORDER[stage],
          STAGE_COLOR_BG[stage],
          isOver && "ring-2 ring-accent-muted border-accent-muted"
        )}
      >
        {contacts.length === 0 && (
          <div className="flex flex-1 items-center justify-center py-8">
            <p className="text-xs text-muted">Sin leads</p>
          </div>
        )}

        {contacts.map((contact) => (
          <LeadCard key={contact.id} data={contact} />
        ))}
      </div>
    </div>
  );
}

export function PipelineBoard({ initialData }: PipelineBoardProps) {
  const [boardData, setBoardData] = useState<BoardData>(initialData);
  const [activeCard, setActiveCard] = useState<LeadCardData | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

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

      const sourceStage = active.data.current?.leadStatus as LeadStatus;
      if (!sourceStage || sourceStage === targetStage) return;

      const card = boardData[sourceStage]?.find((c) => c.id === active.id);
      if (!card) return;

      const newBoard = { ...boardData };
      newBoard[sourceStage] = newBoard[sourceStage].filter((c) => c.id !== active.id);
      newBoard[targetStage] = [
        ...(newBoard[targetStage] || []),
        { ...card, leadStatus: targetStage },
      ];
      setBoardData(newBoard);

      fetch(`/api/whatsapp/contacts/${card.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadStatus: targetStage }),
      }).catch(() => {
        setBoardData(boardData);
      });
    },
    [boardData]
  );

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {PIPELINE_STAGES.map((stage) => (
          <Column
            key={stage}
            stage={stage}
            contacts={boardData[stage] ?? []}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeCard ? <LeadCard data={activeCard} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
