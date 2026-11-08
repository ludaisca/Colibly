"use client";

import { displayName as chatDisplayName } from "@/lib/chats/display-name";
import { useDraggable } from "@dnd-kit/core";
import { labelText } from "@/lib/whatsapp/export-columns";
import { GripVertical, Clock, CalendarClock, Contact, ArrowRightLeft, Copy } from "lucide-react";
import { ContextMenu, type ContextMenuEntry } from "@/app/components/ui/context-menu";
import { CHANNEL_ICONS } from "@/app/components/ui/channel-icons";
import { EntityAvatar } from "@/app/components/ui/avatar";
import { ChannelAvatar } from "@/app/components/ui/channel-avatar";
import { Badge } from "@/app/components/ui/badge";
import { cn } from "@/app/components/ui/cn";
import { useHueClass } from "@/app/components/ui/account-hues";
import { RelativeTime, useMinuteNow } from "@/app/components/ui/relative-time";
import { Button } from "@/app/components/ui/button";
import { Select } from "@/app/components/ui/select";
import type { LeadStatus } from "@prisma/client";
import { formatMxn } from "@/lib/money";

export interface LeadCardData {
  id: string;
  name: string | null;
  remoteJid: string;
  leadStatus: LeadStatus;
  stageId: string;
  accountId: string | null;
  /** Cuenta (WhatsApp o canal) para la línea de color de la tarjeta. */
  lineAccountId?: string | null;
  channel: "WHATSAPP" | "TELEGRAM" | "MESSENGER" | "INSTAGRAM" | "WEBCHAT";
  tags: { tag: { id: string; name: string; color: string } }[];
  bestScore: { score: number; label: string } | null;
  lastMessageAt: string | null;
  unreadCount: number;
  /** Valor del trato en centavos (lib/money.ts). */
  dealValueCents: number | null;
  /** Fecha estimada de cierre (ISO). */
  expectedCloseAt: string | null;
  /** Ejecutivo asignado al chat del contacto. */
  assignee: { id: string; name: string | null } | null;
  /** La etapa es ganada/perdida: una fecha de cierre pasada ya no es atraso. */
  closed?: boolean;
}

// La fecha de cierre se guarda como medianoche UTC del día elegido: se
// muestra en UTC para que sea el mismo día en servidor y navegador.
function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", timeZone: "UTC" });
}

export type StageOption = { id: string; name: string };

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

export function LeadCard({ data, stages, onOpen, onStageChange }: {
  data: LeadCardData;
  stages?: StageOption[];
  onOpen?: (id: string) => void;
  onStageChange?: (id: string, stageId: string) => void;
}) {
  const hueClassFor = useHueClass();
  const displayName = chatDisplayName(data.name, data.remoteJid);
  // "Atrasado" depende de la hora actual: solo después de hidratar.
  const now = useMinuteNow();
  const overdue = now !== null && !data.closed && !!data.expectedCloseAt && Date.parse(data.expectedCloseAt) < now - 86_400_000;
  const phoneShort =
    data.remoteJid?.replace(/@.*$/, "").slice(-10) ?? "";
  const channelLabel = data.channel === "WEBCHAT"
    ? "Chat web"
    : data.channel.charAt(0) + data.channel.slice(1).toLowerCase();

  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: data.id,
      data: { stageId: data.stageId },
    });

  const Mark = CHANNEL_ICONS[data.channel];
  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  // Clic derecho / pulsación larga: atajo de "Ver contacto" y del selector de
  // etapa del pie de la tarjeta (que siguen visibles).
  const menuItems: ContextMenuEntry[] = [
    { type: "label", label: displayName },
    ...(onOpen ? [{ label: "Ver contacto", icon: Contact, onSelect: () => onOpen(data.id) }] : []),
    ...(onStageChange && stages && stages.length > 0
      ? [{
          type: "submenu" as const,
          label: "Mover a etapa",
          icon: ArrowRightLeft,
          items: stages.map((stage) => ({
            label: stage.name,
            checked: stage.id === data.stageId,
            onSelect: () => { if (stage.id !== data.stageId) onStageChange(data.id, stage.id); },
          })),
        }]
      : []),
    ...(data.channel === "WHATSAPP" && phoneShort
      ? [{ type: "separator" as const }, { label: "Copiar número", icon: Copy, onSelect: () => void navigator.clipboard.writeText(data.remoteJid.replace(/@.*$/, "")).catch(() => {}) }]
      : []),
  ];

  return (
    <ContextMenu items={menuItems} disabled={!onOpen && !onStageChange}>
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        // Andén: tarjeta plana con la línea de color de su cuenta a la izquierda.
        "group relative overflow-hidden rounded-xl border border-border bg-surface p-4 pl-5",
        data.lineAccountId && hueClassFor(data.lineAccountId),
        isDragging && "shadow-lg opacity-80 z-50 ring-2 ring-accent-muted"
      )}
    >
      {data.lineAccountId && <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-entity" />}
      <div className="flex items-start gap-3">
        <ChannelAvatar id={data.accountId ?? data.id} name={displayName} channel={data.channel} size="sm" />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold">{displayName}</p>
            {data.unreadCount > 0 && (
              <span className="shrink-0 h-2 w-2 rounded-full bg-danger animate-pulse-live" />
            )}
          </div>

          <div className="mt-1 flex items-center gap-2 text-xs text-muted-darker">
            <Mark size={12} className="shrink-0" />
            {/* El id de Telegram/Messenger es interno: solo se muestra el canal.
                La hora no se parte en dos líneas; lo que se recorta es el canal. */}
            <span className="min-w-0 truncate font-mono tabular-nums" title={data.channel === "WHATSAPP" ? data.remoteJid : undefined}>
              {data.channel === "WHATSAPP" ? phoneShort : channelLabel}
            </span>
            <span className="text-muted" aria-hidden>·</span>
            <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap">
              <Clock size={10} className="shrink-0" aria-hidden />
              {data.lastMessageAt ? <RelativeTime value={data.lastMessageAt} /> : <span>—</span>}
            </span>
          </div>

          {(data.dealValueCents !== null || data.expectedCloseAt || data.assignee) && (
            <div className="mt-2 flex items-center gap-2 text-xs">
              {data.dealValueCents !== null && (
                <span className="font-semibold tabular-nums text-foreground">{formatMxn(data.dealValueCents)}</span>
              )}
              {data.expectedCloseAt && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 tabular-nums",
                    overdue ? "text-danger" : "text-muted-darker"
                  )}
                  title={overdue ? "Cierre estimado (ya pasó)" : "Cierre estimado"}
                >
                  <CalendarClock size={11} aria-hidden />
                  {shortDate(data.expectedCloseAt)}
                </span>
              )}
              {data.assignee && (
                <span className="ml-auto" title={`Asignado a ${data.assignee.name ?? "un ejecutivo"}`}>
                  <EntityAvatar id={data.assignee.id} name={data.assignee.name ?? "?"} size="xs" figure seed={data.assignee.id} />
                </span>
              )}
            </div>
          )}

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
                "h-full rounded-full transition-[width]",
                scoreTone(data.bestScore.score) === "danger" && "bg-danger",
                scoreTone(data.bestScore.score) === "warning" && "bg-warning",
                scoreTone(data.bestScore.score) === "success" && "bg-success"
              )}
              style={{ width: `${data.bestScore.score}%` }}
            />
          </div>
          <span
            className={cn(
              "shrink-0 rounded px-1.5 py-0.5 text-micro font-semibold",
              scoreLabelClass(data.bestScore.label)
            )}
          >
            {labelText(data.bestScore.label)}
          </span>
        </div>
      )}
      {onOpen && (
        <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
          <Button type="button" variant="link" size="sm" onClick={() => onOpen(data.id)}>
            Ver contacto
          </Button>
          {onStageChange && stages && (
            <Select
              compact
              aria-label={`Etapa de ${displayName}`}
              value={data.stageId}
              onChange={(event) => onStageChange(data.id, event.target.value)}
              className="ml-auto max-w-36"
            >
              {stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
            </Select>
          )}
        </div>
      )}
    </div>
    </ContextMenu>
  );
}
