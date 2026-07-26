"use client";

import { useDraggable } from "@dnd-kit/core";
import { GripVertical, Phone, Clock } from "lucide-react";
import { EntityAvatar } from "@/app/components/ui/avatar";
import { Badge } from "@/app/components/ui/badge";
import { cn } from "@/app/components/ui/cn";
import type { LeadStatus } from "@prisma/client";

export interface LeadCardData {
  id: string;
  name: string | null;
  remoteJid: string;
  leadStatus: LeadStatus;
  accountId: string | null;
  tags: { tag: { id: string; name: string; color: string } }[];
  bestScore: { score: number; label: string } | null;
  lastMessageAt: string | null;
  unreadCount: number;
}

function formatTime(ts: string | null): string {
  if (!ts) return "—";
  const diffMs = Date.now() - new Date(ts).getTime();
  const diffH = Math.floor(diffMs / 3600000);
  if (diffH < 1) return `Hace ${Math.floor(diffMs / 60000)}m`;
  if (diffH < 24) return `Hace ${diffH}h`;
  const d = Math.floor(diffH / 24);
  return `Hace ${d}d`;
}

function scoreTone(score: number): "danger" | "warning" | "success" {
  if (score < 40) return "danger";
  if (score < 70) return "warning";
  return "success";
}

function scoreLabelClass(label: string): string {
  const l = label.toLowerCase();
  if (l === "frio") return "bg-info-bg text-info";
  if (l === "tibio") return "bg-warning-bg text-warning";
  if (l === "caliente") return "bg-danger-bg text-danger";
  return "bg-surface-light text-muted";
}

export function LeadCard({ data }: { data: LeadCardData }) {
  const displayName = data.name ?? data.remoteJid ?? "Desconocido";
  const phoneShort =
    data.remoteJid?.replace(/@.*$/, "").slice(-10) ?? "";

  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: data.id,
      data: { leadStatus: data.leadStatus },
    });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group rounded-xl border border-border bg-surface p-4 shadow-sm transition-shadow cursor-grab active:cursor-grabbing",
        isDragging && "shadow-lg opacity-80 z-50 ring-2 ring-accent/30"
      )}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-start gap-3">
        <EntityAvatar
          id={data.accountId ?? data.id}
          name={displayName}
          size="sm"
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold">{displayName}</p>
            {data.unreadCount > 0 && (
              <span className="shrink-0 h-2 w-2 rounded-full bg-danger animate-pulse-live" />
            )}
          </div>

          <div className="mt-1 flex items-center gap-2 text-xs text-muted-darker">
            <Phone size={10} className="shrink-0" />
            <span className="font-mono tabular-nums">{phoneShort}</span>
            <span className="text-muted">·</span>
            <Clock size={10} className="shrink-0" />
            <span>{formatTime(data.lastMessageAt)}</span>
          </div>

          {data.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {data.tags.slice(0, 3).map((ct) => (
                <Badge key={ct.tag.id} tone="neutral" size="sm">
                  {ct.tag.name}
                </Badge>
              ))}
              {data.tags.length > 3 && (
                <Badge tone="neutral" size="sm">
                  +{data.tags.length - 3}
                </Badge>
              )}
            </div>
          )}
        </div>

        <GripVertical
          size={14}
          className="shrink-0 text-muted opacity-0 group-hover:opacity-100 transition-opacity mt-1"
        />
      </div>

      {data.bestScore && (
        <div className="mt-3 flex items-center gap-2">
          <div className="h-1.5 flex-1 rounded-full bg-surface-light overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                scoreTone(data.bestScore.score) === "danger" && "bg-danger",
                scoreTone(data.bestScore.score) === "warning" && "bg-warning",
                scoreTone(data.bestScore.score) === "success" && "bg-success"
              )}
              style={{ width: `${data.bestScore.score}%` }}
            />
          </div>
          <span
            className={cn(
              "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase",
              scoreLabelClass(data.bestScore.label)
            )}
          >
            {data.bestScore.label}
          </span>
        </div>
      )}
    </div>
  );
}
