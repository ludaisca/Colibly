"use client";

import { FiltersPanel, type FilterFieldDef } from "@/app/components/ui/filters-panel";
import { HAS_REPLIED_OPTIONS, type CampaignOption } from "./chat-shared";

// Envoltura fina sobre el <FiltersPanel> genérico (app/components/ui) con la
// forma de props específica que ya espera chat-list-panel.tsx. Cuenta no es
// una condición aquí — ya tiene su propia fila de chips arriba de este panel
// (ver chat-list-panel.tsx), duplicarla confundiría cuál manda.

interface ChatFiltersPanelProps {
  campaigns: CampaignOption[];
  campaignFilter: string;
  onCampaignFilterChange: (id: string) => void;
  hasRepliedFilter: "" | "yes" | "no";
  onHasRepliedFilterChange: (value: "" | "yes" | "no") => void;
}

export function ChatFiltersPanel({
  campaigns,
  campaignFilter,
  onCampaignFilterChange,
  hasRepliedFilter,
  onHasRepliedFilterChange,
}: ChatFiltersPanelProps) {
  const fields: FilterFieldDef[] = [
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
      fields={fields}
      values={{ campaign: campaignFilter, hasReplied: hasRepliedFilter }}
      onApply={(v) => {
        onCampaignFilterChange(v.campaign ?? "");
        onHasRepliedFilterChange((v.hasReplied ?? "") as "" | "yes" | "no");
      }}
    />
  );
}
