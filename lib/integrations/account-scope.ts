import { getUserAccountIds, getUserChannelAccountIds } from "@/lib/shared-accounts";
import type { AccountRef } from "@/lib/events/types";

// Alcance de una integración (ApiKey o WebhookEndpoint): lo que su dueño puede
// ver HOY (propias + compartidas, se recalcula en cada uso para que retirar un
// share corte también la integración), recortado a las cuentas elegidas.
// Ambas listas vacías = sin recorte.
export interface IntegrationRestriction {
  accountIds: string[];
  channelAccountIds: string[];
}

export interface ResolvedScope {
  accountIds: string[];
  channelAccountIds: string[];
}

export function isRestricted(r: IntegrationRestriction): boolean {
  return r.accountIds.length > 0 || r.channelAccountIds.length > 0;
}

export async function resolveIntegrationScope(ownerId: string, r: IntegrationRestriction): Promise<ResolvedScope> {
  const [accountIds, channelAccountIds] = await Promise.all([
    getUserAccountIds(ownerId),
    getUserChannelAccountIds(ownerId),
  ]);
  if (!isRestricted(r)) return { accountIds, channelAccountIds };
  return {
    accountIds: accountIds.filter((id) => r.accountIds.includes(id)),
    channelAccountIds: channelAccountIds.filter((id) => r.channelAccountIds.includes(id)),
  };
}

export function scopeIncludes(scope: ResolvedScope, account: AccountRef): boolean {
  return account.kind === "whatsapp"
    ? scope.accountIds.includes(account.id)
    : scope.channelAccountIds.includes(account.id);
}
