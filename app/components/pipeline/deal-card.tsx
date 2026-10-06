"use client";

import { useDraggable } from "@dnd-kit/core";
import { CalendarClock, GripVertical, Megaphone, UserRound } from "lucide-react";
import { EntityAvatar } from "@/app/components/ui/avatar";
import { Badge } from "@/app/components/ui/badge";
import { cn } from "@/app/components/ui/cn";
import { formatMoney, timeInStage } from "@/lib/pipeline/format";
import type { BoardDeal, BoardStage } from "@/lib/pipeline/types";

export function DealCard({
  deal,
  currency,
  stages,
  onOpenContact,
  onMove,
}: {
  deal: BoardDeal;
  currency: string;
  stages?: BoardStage[];
  onOpenContact?: (contactId: string) => void;
  onMove?: (dealId: string, stageId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: deal.id, data: { stageId: deal.stageId } });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  const sameName = deal.title.trim().toLowerCase() === deal.person.name.trim().toLowerCase();

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn("group rounded-xl border border-border bg-surface p-4 shadow-sm transition-shadow", isDragging && "z-50 opacity-80 shadow-lg ring-2 ring-accent-muted")}
    >
      <div className="flex items-start gap-3">
        <EntityAvatar id={deal.personId} name={deal.person.name} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold" title={deal.title}>{deal.title}</p>
          {!sameName && <p className="truncate text-xs text-muted-darker">{deal.person.name}</p>}
          {deal.company && <p className="truncate text-xs text-muted-darker">{deal.company.name}</p>}
          <p className="mt-1 font-mono text-sm font-semibold tabular-nums">{formatMoney(deal.amount, currency)}</p>
        </div>
        <button
          type="button"
          aria-label={`Mover ${deal.title}`}
          className="mt-0.5 shrink-0 cursor-grab rounded p-1 text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={16} />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-darker">
        <span>En la etapa {timeInStage(deal.stageEnteredAt)}</span>
        {deal.expectedCloseDate && (
          <span className="inline-flex items-center gap-1" title="Cierre esperado">
            <CalendarClock size={11} />
            {new Date(deal.expectedCloseDate).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}
          </span>
        )}
        {deal.owner && (
          <span className="inline-flex items-center gap-1" title="Responsable">
            <UserRound size={11} />
            {deal.owner.name}
          </span>
        )}
        {deal.leadOrigin !== "ORGANIC" && (
          <Badge tone="info" size="sm" icon={Megaphone}>
            Anuncio
          </Badge>
        )}
      </div>

      {(onOpenContact || onMove) && (
        <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
          {onOpenContact && deal.contactId && (
            <button type="button" onClick={() => onOpenContact(deal.contactId!)} className="text-xs font-semibold text-accent-ink hover:underline">
              Ver contacto
            </button>
          )}
          {onMove && stages && (
            <select
              aria-label={`Etapa de ${deal.title}`}
              value={deal.stageId}
              onChange={(event) => onMove(deal.id, event.target.value)}
              className="ml-auto max-w-36 rounded border border-border bg-surface px-2 py-1 text-xs text-foreground"
            >
              {stages.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  );
}
