// Estado de un bot tal como se muestra (tarjeta "N/M activos" y tabla de
// Estadísticas, listas de bots). Una sola función para que nunca se
// contradigan: antes la tarjeta contaba `isActive` y la tabla mostraba
// `status`, que vale ACTIVE por defecto aunque el bot esté apagado o sin cuenta.

export type BotDisplayStatus = "active" | "inactive" | "error" | "no_account";

export interface BotStatusInput {
  isActive: boolean;
  status: string;
  waAccountId: string | null;
  channelAccountId: string | null;
}

export function botDisplayStatus(bot: BotStatusInput): BotDisplayStatus {
  if (!bot.waAccountId && !bot.channelAccountId) return "no_account";
  if (bot.status === "ERROR") return "error";
  return bot.isActive ? "active" : "inactive";
}

export const BOT_DISPLAY_STATUS_LABEL: Record<BotDisplayStatus, { label: string; tone: "success" | "neutral" | "danger" | "warning" }> = {
  active: { label: "Activo", tone: "success" },
  inactive: { label: "Inactivo", tone: "neutral" },
  error: { label: "Error", tone: "danger" },
  no_account: { label: "Sin cuenta", tone: "warning" },
};
