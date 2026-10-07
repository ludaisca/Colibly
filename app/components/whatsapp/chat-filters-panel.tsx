"use client";

import { SlidersHorizontal } from "lucide-react";
import { Badge } from "@/app/components/kit/badge";
import { Button } from "@/app/components/kit/button";
import { Popover, PopoverPopup, PopoverTrigger } from "@/app/components/kit/popover";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/app/components/kit/select";
import { HAS_REPLIED_OPTIONS, type CampaignOption } from "./chat-shared";

// Filtros de la bandeja que no caben como pestaña: estado de la conversación,
// campaña y si el lead ha respondido. Se aplican al elegirlos; el contador del
// botón avisa que hay alguno activo. La cuenta y las vistas (míos, sin leer…)
// viven en el rail y en las pestañas de la lista.

interface ChatFiltersPanelProps {
  campaigns: CampaignOption[];
  campaignFilter: string;
  onCampaignFilterChange: (id: string) => void;
  hasRepliedFilter: "" | "yes" | "no";
  onHasRepliedFilterChange: (value: "" | "yes" | "no") => void;
  statusFilter: "" | "RESOLVED" | "ALL";
  onStatusFilterChange: (value: "" | "RESOLVED" | "ALL") => void;
}

const STATUS_OPTIONS: Array<{ value: "" | "RESOLVED" | "ALL"; label: string }> = [
  { value: "", label: "Abiertos y pendientes" },
  { value: "RESOLVED", label: "Resueltos" },
  { value: "ALL", label: "Todos los estados" },
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

export function ChatFiltersPanel({
  campaigns,
  campaignFilter,
  onCampaignFilterChange,
  hasRepliedFilter,
  onHasRepliedFilterChange,
  statusFilter,
  onStatusFilterChange,
}: ChatFiltersPanelProps) {
  const active = [statusFilter, campaignFilter, hasRepliedFilter].filter(Boolean).length;
  const campaignLabel = campaigns.find((c) => c.id === campaignFilter)?.name ?? "Todas";

  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" size="sm" aria-label={active ? `Filtros (${active} activos)` : "Filtros"} />}>
        <SlidersHorizontal />
        Filtros
        {active > 0 && <Badge size="sm" className="rounded-full tabular-nums">{active}</Badge>}
      </PopoverTrigger>
      <PopoverPopup align="end" className="w-72">
        <div className="space-y-4">
          <Field label="Estado">
            <Select value={statusFilter} onValueChange={(v) => onStatusFilterChange((v ?? "") as "" | "RESOLVED" | "ALL")}>
              <SelectTrigger aria-label="Estado"><SelectValue>{STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label}</SelectValue></SelectTrigger>
              <SelectPopup>{STATUS_OPTIONS.map((o) => <SelectItem key={o.value || "open"} value={o.value}>{o.label}</SelectItem>)}</SelectPopup>
            </Select>
          </Field>
          {campaigns.length > 0 && (
            <Field label="Campaña">
              <Select value={campaignFilter} onValueChange={(v) => onCampaignFilterChange(v ?? "")}>
                <SelectTrigger aria-label="Campaña"><SelectValue>{campaignLabel}</SelectValue></SelectTrigger>
                <SelectPopup>
                  <SelectItem value="">Todas</SelectItem>
                  {campaigns.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectPopup>
              </Select>
            </Field>
          )}
          <Field label="Respuesta del lead">
            <Select value={hasRepliedFilter} onValueChange={(v) => onHasRepliedFilterChange((v ?? "") as "" | "yes" | "no")}>
              <SelectTrigger aria-label="Respuesta del lead"><SelectValue>{HAS_REPLIED_OPTIONS.find((o) => o.value === hasRepliedFilter)?.label}</SelectValue></SelectTrigger>
              <SelectPopup>{HAS_REPLIED_OPTIONS.map((o) => <SelectItem key={o.value || "all"} value={o.value}>{o.label}</SelectItem>)}</SelectPopup>
            </Select>
          </Field>
          {active > 0 && (
            <Button variant="ghost" size="sm" className="w-full" onClick={() => { onStatusFilterChange(""); onCampaignFilterChange(""); onHasRepliedFilterChange(""); }}>
              Limpiar filtros
            </Button>
          )}
        </div>
      </PopoverPopup>
    </Popover>
  );
}
