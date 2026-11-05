import { prisma } from "@/lib/prisma";
import { effectiveOrgLimits, evaluatePlanLimit, getOrgBilling, getOrgUsage, orgIdForAccount } from "@/lib/billing/gates";
import { notifyAccountAdmins } from "@/lib/whatsapp/coexistence/notify";

// Cuántos contactos nuevos caben todavía en el plan de la organización de una
// cuenta de WhatsApp (Infinity sin tope, p. ej. organización interna).
export async function contactsRemaining(waAccountId: string): Promise<number> {
  const organizationId = await orgIdForAccount({ waAccountId });
  if (!organizationId) return 0;
  const org = await getOrgBilling(organizationId);
  if (!org) return 0;
  const max = (await effectiveOrgLimits(org)).contacts;
  if (max === Infinity) return Infinity;
  const { contacts } = await getOrgUsage(organizationId);
  return Math.max(0, max - contacts);
}

// Aviso (campana) la primera vez que la importación del historial llega al
// tope: `totalAfter` es history_skipped_chats ya incrementado.
export async function notifyContactLimitOnce(waAccountId: string, addedNow: number, totalAfter: number): Promise<void> {
  if (totalAfter !== addedNow) return;
  const account = await prisma.wAAccount.findUnique({ where: { id: waAccountId }, select: { organizationId: true, name: true } });
  if (!account) return;
  const exceeded = await evaluatePlanLimit(account.organizationId, "contacts");
  const max = exceeded?.max;
  await notifyAccountAdmins(account.organizationId, {
    accountId: waAccountId,
    title: `"${account.name}": llegaste al límite de contactos`,
    body: `${max ? `Tu plan incluye ${max.toLocaleString("es-MX")} contactos. ` : ""}El historial de la app WhatsApp Business se sigue importando, pero las conversaciones nuevas quedan sin contacto; el contacto se crea cuando esa persona vuelva a escribir.`,
  });
}
