"use client";

import { useDraggable } from "@dnd-kit/core";
import { labelText } from "@/lib/whatsapp/export-columns";
import { GripVertical, Phone, Clock, MessageCircle } from "lucide-react";
import { PIPELINE_STAGES, STAGE_LABEL } from "@/lib/pipeline/stages";
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
  channel: "WHATSAPP" | "TELEGRAM" | "MESSENGER" | "INSTAGRAM" | "WEBCHAT";
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

// Etiquetas actuales del calificador (lib/whatsapp/lead-scoring.ts) más las
// del esquema viejo frio/tibio/caliente, que siguen en scores antiguos.
function scoreLabelClass(label: string): string {
  const l = label.toLowerCase();
  if (l === "prioridad_alta" || l === "caliente") return "bg-danger-bg text-danger";
  if (l === "oportunidad") return "bg-success-bg text-success";
  if (l === "interesado" || l === "tibio") return "bg-warning-bg text-warning";
  if (l === "frio") return "bg-info-bg text-info";
  return "bg-surface-light text-muted";
}

export function LeadCard({ data, onOpen, onStageChange }: {
  data: LeadCardData;
  onOpen?: (id: string) => void;
  onStageChange?: (id: string, stage: LeadStatus) => void;
}) {
  const displayName = data.name ?? data.remoteJid ?? "Desconocido";
  const phoneShort =
    data.remoteJid?.replace(/@.*$/, "").slice(-10) ?? "";
  const channelLabel = data.channel === "WEBCHAT"
    ? "Chat web"
    : data.channel.charAt(0) + data.channel.slice(1).toLowerCase();

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
        "group rounded-xl border border-border bg-surface p-4 shadow-sm transition-shadow",
        isDragging && "shadow-lg opacity-80 z-50 ring-2 ring-accent-muted"
      )}
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
            {data.channel === "WHATSAPP" ? <Phone size={10} className="shrink-0" /> : <MessageCircle size={10} className="shrink-0" />}
            <span className="truncate font-mono tabular-nums" title={data.remoteJid}>
              {data.channel === "WHATSAPP" ? phoneShort : `${channelLabel} · ${data.remoteJid}`}
            </span>
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

        <button
          type="button"
          aria-label={`Mover ${displayName}`}
          className="mt-0.5 shrink-0 cursor-grab rounded p-1 text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent active:cursor-grabbing"
          {...attributes}
          {...listeners}
        ><GripVertical size={16} /></button>
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
              "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold",
              scoreLabelClass(data.bestScore.label)
            )}
          >
            {labelText(data.bestScore.label)}
          </span>
        </div>
      )}
      {onOpen && (
        <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
          <button type="button" onClick={() => onOpen(data.id)} className="text-xs font-semibold text-accent-ink hover:underline">
            Ver contacto
          </button>
          {onStageChange && (
            <select
              aria-label={`Etapa de ${displayName}`}
              value={data.leadStatus}
              onChange={(event) => onStageChange(data.id, event.target.value as LeadStatus)}
              className="ml-auto max-w-36 rounded border border-border bg-surface px-2 py-1 text-xs text-foreground"
            >
              {PIPELINE_STAGES.map((stage) => <option key={stage} value={stage}>{STAGE_LABEL[stage]}</option>)}
            </select>
          )}
        </div>
      )}
    </div>
  );
}
