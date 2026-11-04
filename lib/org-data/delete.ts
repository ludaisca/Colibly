import { prisma } from "@/lib/prisma";
import { invalidateOrgBilling } from "@/lib/billing/gates";
import { getStripe, isStripeConfigured } from "@/lib/billing/stripe";
import { purgeDue } from "@/lib/billing/state";
import { removeAccountMedia } from "@/lib/whatsapp/media-store";
import { invalidateAccountScopes } from "@/lib/shared-accounts";

// Borrado definitivo de una organización y todo lo suyo. Lo usan el dueño
// (DELETE /api/organizacion) y la purga de canceladas del tick de facturación
// (canceladas y pruebas vencidas sin pago; ver purgeDue() en lib/billing/state.ts).
//
// Casi todo cae por cascada desde Organization (todas las relaciones requeridas
// del schema son onDelete: Cascade). Quedan fuera de la cascada y se borran aquí:
//  - los fragmentos de conocimiento RAG (WABotKnowledge solo se liga a los bots
//    por la tabla puente; sin esto quedaban los documentos del cliente huérfanos),
//  - los archivos de media en disco (una carpeta por cuenta bajo MEDIA_ROOT).
// La suscripción de Stripe se cancela ANTES de borrar: si Stripe falla no se
// borra nada, para no dejar a un cliente sin datos pero con cobro vigente. El
// cliente de Stripe (customer) se conserva: sus facturas son registro fiscal.

export interface DeleteOrganizationResult {
  users: number;
  accounts: number;
}

// `onlyIfPurgeDue`: la purga del tick vuelve a comprobar la regla con el estado
// recién leído (si se volvió a suscribir entre la consulta y el borrado, no
// se borra). Devuelve null en ese caso.
export async function deleteOrganizationData(organizationId: string, opts: { onlyIfPurgeDue?: Date } = {}): Promise<DeleteOrganizationResult | null> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
      isInternal: true,
      stripeSubscriptionId: true,
      status: true,
      canceledAt: true,
      trialEndsAt: true,
      waAccounts: { select: { id: true } },
      channelAccounts: { select: { id: true } },
      _count: { select: { members: true } },
    },
  });
  if (!org) throw new Error("La organización no existe");
  // La instalación original y las demos no se borran por esta vía.
  if (org.isInternal) throw new Error("Una organización interna no se puede eliminar");
  if (opts.onlyIfPurgeDue && !purgeDue(org, opts.onlyIfPurgeDue)) return null;

  if (org.stripeSubscriptionId && org.status !== "CANCELED") {
    if (!(await isStripeConfigured())) throw new Error("La organización tiene una suscripción y los pagos no están configurados para cancelarla");
    const stripe = await getStripe();
    const sub = await stripe.subscriptions.retrieve(org.stripeSubscriptionId);
    // Ya terminada en Stripe (p. ej. el webhook aún no llegaba): nada que cancelar.
    if (sub.status !== "canceled" && sub.status !== "incomplete_expired") {
      await stripe.subscriptions.cancel(sub.id);
    }
  }

  const accountIds = [...org.waAccounts.map((a) => a.id), ...org.channelAccounts.map((a) => a.id)];

  await prisma.$transaction(async (tx) => {
    // Conocimiento ligado a bots de esta organización y a ningún bot ajeno.
    await tx.$executeRaw`
      DELETE FROM "wa_bot_knowledge" k
      WHERE EXISTS (
        SELECT 1 FROM "wa_bot_knowledge_bots" kb JOIN "wa_bots" b ON b.id = kb."botId"
        WHERE kb."knowledgeId" = k.id AND b.organization_id = ${organizationId}
      )
      AND NOT EXISTS (
        SELECT 1 FROM "wa_bot_knowledge_bots" kb JOIN "wa_bots" b ON b.id = kb."botId"
        WHERE kb."knowledgeId" = k.id AND b.organization_id <> ${organizationId}
      )`;
    await tx.organization.delete({ where: { id: organizationId } });
    invalidateAccountScopes();
  }, { timeout: 120_000 });
  invalidateOrgBilling(organizationId);

  // Los archivos van después de la base: si algo falla aquí, los datos ya no
  // son accesibles desde la app y el error queda en el log para limpiarlo.
  for (const id of accountIds) {
    try {
      await removeAccountMedia(id);
    } catch (err) {
      console.error(`[org-delete] No se pudo borrar la media de la cuenta ${id}:`, err);
    }
  }

  console.log(`[org-delete] Organización ${organizationId} eliminada (${org._count.members} usuario(s), ${accountIds.length} cuenta(s))`);
  return { users: org._count.members, accounts: accountIds.length };
}
