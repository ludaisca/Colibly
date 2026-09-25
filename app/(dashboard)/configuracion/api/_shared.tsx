"use client";

import { FormField } from "@/app/components/ui/form-field";
import { MultiSelect } from "@/app/components/ui/multi-select";

export type IntegrationChannel = "WHATSAPP" | "TELEGRAM" | "MESSENGER" | "INSTAGRAM" | "WEBCHAT";

export interface IntegrationAccount {
  id: string;
  name: string;
  channel: IntegrationChannel;
}

export const CHANNEL_LABEL: Record<IntegrationChannel, string> = {
  WHATSAPP: "WhatsApp",
  TELEGRAM: "Telegram",
  MESSENGER: "Messenger",
  INSTAGRAM: "Instagram",
  WEBCHAT: "Web",
};

// Selector de alcance compartido por el formulario de key y el de webhook: una
// sola lista de cuentas; al guardar se separa en accountIds (WhatsApp) y
// channelAccountIds (demás canales), que es como lo guarda el modelo.
export function AccountScopeField({
  accounts,
  value,
  onChange,
}: {
  accounts: IntegrationAccount[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <FormField label="Cuentas" hint="Vacío = todas tus cuentas, incluidas las que agregues después.">
      {(id) => (
        <MultiSelect
          id={id}
          options={accounts.map((a) => ({ value: a.id, label: `${a.name} · ${CHANNEL_LABEL[a.channel]}` }))}
          value={value}
          onChange={onChange}
          placeholder="Todas las cuentas"
        />
      )}
    </FormField>
  );
}

export function splitAccountIds(ids: string[], accounts: IntegrationAccount[]) {
  const channelOf = new Map(accounts.map((a) => [a.id, a.channel]));
  return {
    accountIds: ids.filter((id) => channelOf.get(id) === "WHATSAPP"),
    channelAccountIds: ids.filter((id) => channelOf.get(id) && channelOf.get(id) !== "WHATSAPP"),
  };
}

export function scopeSummary(accountIds: string[], channelAccountIds: string[], accounts: IntegrationAccount[]): string {
  const ids = [...accountIds, ...channelAccountIds];
  if (ids.length === 0) return "Todas las cuentas";
  const names = ids.map((id) => accounts.find((a) => a.id === id)?.name).filter(Boolean);
  return names.length <= 2 ? names.join(", ") : `${names.slice(0, 2).join(", ")} y ${names.length - 2} más`;
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
}
