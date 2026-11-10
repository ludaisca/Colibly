import { prisma } from "@/lib/prisma";
import { invalidateAccountScopes } from "@/lib/shared-accounts";
import { jidCandidates } from "@/lib/whatsapp/coexistence/normalize";

// Al conectar el PRIMER WhatsApp de una organización, los contactos "sin canal"
// (creados a mano o por CSV; accountId y channelAccountId null) pasan a esa
// cuenta, con sus etiquetas, notas, citas y etapa. Si el número ya existe en la
// cuenta (llegó un mensaje o el historial de coexistencia lo creó antes), se
// FUSIONA en el contacto de la cuenta: se mueve lo que colgaba del sin-canal y
// este se borra. Los datos de ejemplo no se vinculan. Idempotente: sin
// contactos sin canal no hace nada, y repetirlo no cambia nada.

export interface LinkOrphansResult {
  linked: number;
  merged: number;
  tagsMoved: number;
}

export async function linkChannellessContacts(organizationId: string, waAccountId: string): Promise<LinkOrphansResult> {
  const result: LinkOrphansResult = { linked: 0, merged: 0, tagsMoved: 0 };

  // Solo con el primer WhatsApp de la organización.
  const accountCount = await prisma.wAAccount.count({ where: { organizationId } });
  if (accountCount !== 1) return result;

  const orphans = await prisma.contact.findMany({
    where: { organizationId, accountId: null, channelAccountId: null, isSample: false },
    select: { id: true, remoteJid: true, leadStatus: true, pipelineStageId: true, dealValueCents: true, expectedCloseAt: true },
  });
  if (orphans.length === 0 && (await prisma.tag.count({ where: { organizationId, waAccountId: null, channelAccountId: null } })) === 0) return result;

  await prisma.$transaction(
    async (tx) => {
      for (const orphan of orphans) {
        const twin = await tx.contact.findFirst({
          where: { accountId: waAccountId, remoteJid: { in: jidCandidates(orphan.remoteJid) } },
          select: { id: true, leadStatus: true, pipelineStageId: true, dealValueCents: true },
        });
        if (!twin) {
          await tx.contact.update({ where: { id: orphan.id }, data: { accountId: waAccountId, organizationId: null } });
          result.linked++;
          continue;
        }
        // Fusión: lo del sin-canal pasa al contacto de la cuenta.
        const tags = await tx.contactTag.findMany({ where: { contactId: orphan.id }, select: { tagId: true } });
        if (tags.length) await tx.contactTag.createMany({ data: tags.map((t) => ({ contactId: twin.id, tagId: t.tagId })), skipDuplicates: true });
        await tx.wANote.updateMany({ where: { contactId: orphan.id }, data: { contactId: twin.id } });
        await tx.wAAppointment.updateMany({ where: { contactId: orphan.id }, data: { contactId: twin.id } });
        await tx.contactTask.updateMany({ where: { contactId: orphan.id }, data: { contactId: twin.id } });
        await tx.contactActivity.updateMany({ where: { contactId: orphan.id }, data: { contactId: twin.id } });
        await tx.leadOutcomeEvent.updateMany({ where: { contactId: orphan.id }, data: { contactId: twin.id } });
        // Etapa y valor del trato: lo que ya se había trabajado a mano gana sobre un contacto recién creado.
        const worked = orphan.leadStatus !== "NEW" || orphan.pipelineStageId !== null;
        await tx.contact.update({
          where: { id: twin.id },
          data: {
            ...(worked ? { leadStatus: orphan.leadStatus, pipelineStageId: orphan.pipelineStageId } : {}),
            ...(twin.dealValueCents === null && orphan.dealValueCents !== null ? { dealValueCents: orphan.dealValueCents, expectedCloseAt: orphan.expectedCloseAt } : {}),
          },
        });
        await tx.contact.delete({ where: { id: orphan.id } });
        result.merged++;
      }

      // Etiquetas de la organización: pasan a la cuenta o, si ya hay una con el mismo nombre, se reutiliza esa.
      const orgTags = await tx.tag.findMany({ where: { organizationId, waAccountId: null, channelAccountId: null }, select: { id: true, name: true } });
      for (const tag of orgTags) {
        const same = await tx.tag.findFirst({ where: { waAccountId, name: tag.name }, select: { id: true } });
        if (!same) {
          await tx.tag.update({ where: { id: tag.id }, data: { waAccountId, organizationId: null } });
        } else {
          const rows = await tx.contactTag.findMany({ where: { tagId: tag.id }, select: { contactId: true } });
          if (rows.length) await tx.contactTag.createMany({ data: rows.map((r) => ({ contactId: r.contactId, tagId: same.id })), skipDuplicates: true });
          await tx.tag.delete({ where: { id: tag.id } });
        }
        result.tagsMoved++;
      }
    },
    { timeout: 60_000, maxWait: 10_000 }
  );

  invalidateAccountScopes();
  if (result.linked + result.merged + result.tagsMoved > 0) {
    console.log(`[contacts] sin canal → cuenta ${waAccountId}: ${result.linked} vinculados, ${result.merged} fusionados, ${result.tagsMoved} etiquetas`);
  }
  return result;
}

/** Para las rutas de conexión: nunca debe tumbar la conexión de la cuenta. */
export async function linkChannellessContactsSafely(organizationId: string, waAccountId: string): Promise<void> {
  try {
    await linkChannellessContacts(organizationId, waAccountId);
  } catch (err) {
    console.error("[contacts] no se pudieron vincular los contactos sin canal:", err instanceof Error ? err.message : err);
  }
}
