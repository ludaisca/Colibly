"use client";

import { FiltersPanel, type FilterFieldDef } from "@/app/components/ui/filters-panel";
import {
  HAS_REPLIED_OPTIONS,
  PRIORITY_OPTIONS,
  type CampaignOption,
  type ChatPriority,
} from "./chat-shared";

// Envoltura fina sobre el <FiltersPanel> genérico (app/components/ui) con la
// forma de props específica que ya espera chat-list-panel.tsx. Cuenta no es
// una condición aquí — ya tiene su propia fila de chips arriba de este panel
// (ver chat-list-panel.tsx), duplicarla confundiría cuál manda.

export type AssignedFilter = "" | "me" | "unassigned";
export type SnoozedFilter = "" | "only" | "all";

interface ChatFiltersPanelProps {
  campaigns: CampaignOption[];
  campaignFilter: string;
  onCampaignFilterChange: (id: string) => void;
  hasRepliedFilter: "" | "yes" | "no";
  onHasRepliedFilterChange: (value: "" | "yes" | "no") => void;
  assignedFilter: AssignedFilter;
  onAssignedFilterChange: (value: AssignedFilter) => void;
  priorityFilter: ChatPriority | "";
  onPriorityFilterChange: (value: ChatPriority | "") => void;
  snoozedFilter: SnoozedFilter;
  onSnoozedFilterChange: (value: SnoozedFilter) => void;
  awaitingFilter: boolean;
  onAwaitingFilterChange: (value: boolean) => void;
}

export function ChatFiltersPanel({
  campaigns,
  campaignFilter,
  onCampaignFilterChange,
  hasRepliedFilter,
  onHasRepliedFilterChange,
  assignedFilter,
  onAssignedFilterChange,
  priorityFilter,
  onPriorityFilterChange,
  snoozedFilter,
  onSnoozedFilterChange,
  awaitingFilter,
  onAwaitingFilterChange,
}: ChatFiltersPanelProps) {
  const fields: FilterFieldDef[] = [
    {
      key: "assigned",
      label: "Asignación",
      options: [
        { value: "", label: "Todos" },
        { value: "me", label: "Míos" },
        { value: "unassigned", label: "Sin asignar" },
      ],
    },
    {
      key: "awaiting",
      label: "Respuesta",
      options: [
        { value: "", label: "Todas" },
        { value: "1", label: "Esperando respuesta" },
      ],
    },
    {
      key: "priority",
      label: "Prioridad",
      options: [{ value: "", label: "Todas" }, ...PRIORITY_OPTIONS],
    },
    {
      key: "snoozed",
      label: "Pospuestos",
      options: [
        { value: "", label: "Ocultar pospuestos" },
        { value: "only", label: "Solo pospuestos" },
        { value: "all", label: "Incluir pospuestos" },
      ],
    },
    ...(campaigns.length > 0
      ? [{
          key: "campaign",
          label: "Campaña",
          options: [{ value: "", label: "Todas" }, ...campaigns.map((c) => ({ value: c.id, label: c.name }))],
        }]
      : []),
    {
      key: "hasReplied",
      label: "Respondió",
      options: HAS_REPLIED_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label })),
    },
  ];

  return (
    <FiltersPanel
      panelTitle="Filtrar conversaciones"
      compact
      fields={fields}
      values={{
        assigned: assignedFilter,
        priority: priorityFilter,
        snoozed: snoozedFilter,
        awaiting: awaitingFilter ? "1" : "",
        campaign: campaignFilter,
        hasReplied: hasRepliedFilter,
      }}
      onApply={(v) => {
        onAssignedFilterChange((v.assigned ?? "") as AssignedFilter);
        onPriorityFilterChange((v.priority ?? "") as ChatPriority | "");
        onSnoozedFilterChange((v.snoozed ?? "") as SnoozedFilter);
        onAwaitingFilterChange(v.awaiting === "1");
        onCampaignFilterChange(v.campaign ?? "");
        onHasRepliedFilterChange((v.hasReplied ?? "") as "" | "yes" | "no");
      }}
    />
  );
}
