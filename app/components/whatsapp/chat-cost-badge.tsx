"use client";

import { useState, useEffect, useCallback } from "react";
import { DollarSign, Bot, Sparkles, Zap } from "lucide-react";
import { Dropdown, DropdownButton } from "@/app/components/ui/dropdown";
import { Badge } from "@/app/components/ui/badge";

interface UsageEntry {
  source: "bot" | "scorer" | "automation";
  name: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
  createdAt: string;
}

interface UsageData {
  totalCost: number;
  totalTokens: number;
  interactions: number;
  entries: UsageEntry[];
}

function formatCost(value: number): string {
  if (value === 0) return "$0";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  if (value < 1) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(2)}`;
}

export function ChatCostBadge({ chatId, showEmpty = false }: { chatId: string; showEmpty?: boolean }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<UsageData | null>(null);

  const fetchUsage = useCallback(async () => {
    try {
      const res = await fetch(`/api/whatsapp/chats/${chatId}/usage`);
      const json = await res.json();
      if (res.ok) setData(json);
    } catch {
      // silent — cost is informational, not critical path
    }
  }, [chatId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on chat change
    fetchUsage();
  }, [fetchUsage]);

  if (!data) return showEmpty ? <p className="text-xs text-muted-darker">Consumo no disponible todavía.</p> : null;
  if (data.interactions === 0) return showEmpty ? <p className="text-xs text-muted-darker">Sin consumo registrado en este chat.</p> : null;

  return (
    <Dropdown
      open={open}
      onOpenChange={setOpen}
      align="right"
      portal
      closeOnSelect={false}
      trigger={
        <DropdownButton
          label={`${formatCost(data.totalCost)} IA`}
          icon={DollarSign}
          size="sm"
        />
      }
    >
      <div className="p-3 w-[min(20rem,calc(100vw-2rem))] space-y-3 max-h-[70vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-lg font-semibold">{formatCost(data.totalCost)}</p>
            <p className="text-xs text-muted-darker">
              {data.totalTokens.toLocaleString()} tokens · {data.interactions} interacción{data.interactions === 1 ? "" : "es"}
            </p>
          </div>
        </div>

        <p className="text-xs text-muted-darker">
          Costo estimado de IA atribuible a esta conversación (respuestas del bot, calificaciones de lead y pasos de IA de automatizaciones). No incluye el costo de mensajes API de WhatsApp.
        </p>

        <div className="space-y-1.5 pt-2 border-t border-border">
          {data.entries.map((entry, i) => (
            <div key={i} className="flex items-start justify-between gap-2 text-xs">
              <div className="flex items-start gap-1.5 min-w-0">
                {entry.source === "bot" ? (
                  <Bot size={12} className="text-accent-ink shrink-0 mt-0.5" />
                ) : entry.source === "automation" ? (
                  <Zap size={12} className="text-info shrink-0 mt-0.5" />
                ) : (
                  <Sparkles size={12} className="text-warning shrink-0 mt-0.5" />
                )}
                <div className="min-w-0">
                  <p className="truncate text-foreground">{entry.name}</p>
                  <p className="text-xs text-muted-darker">
                    {new Date(entry.createdAt).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })} · {entry.totalTokens} tok
                  </p>
                </div>
              </div>
              <Badge tone="neutral" size="sm" className="shrink-0 tabular-nums">
                {formatCost(entry.estimatedCost)}
              </Badge>
            </div>
          ))}
        </div>
      </div>
    </Dropdown>
  );
}
