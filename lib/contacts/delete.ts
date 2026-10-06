import { promises as fs } from "node:fs";
import { prisma } from "@/lib/prisma";
import { resolveAbsolutePath } from "@/lib/whatsapp/media-store";
import { remoteJidCandidates } from "@/lib/contacts/jid";

// Borrado DEFINITIVO de un contacto y de todo lo que se sabe de él (derecho de
// cancelación de datos personales). Lo que cuelga del contacto por cascada
// (etiquetas, notas, citas, campos personalizados, inscripciones a secuencias,
// corridas de automatización, eventos de Meta) cae solo. El chat y la
// conversación se ligan con SetNull, así que se borran aquí junto con sus mensajes
// (cascada) y los archivos de media.
//
// Lo que NO se borra, a propósito:
//  - el teléfono en los registros de entrega de campañas (`WACampaignRecipient`)
//    y de importación de hojas (`LeadSheetImportedRow`): son el registro de que
//    ya se le escribió y la hoja de Google, si sigue listando el número, lo
//    volvería a contactar. Solo se les quita el nombre.
//  - archivos de media compartidos con otros mensajes (el encabezado de una
//    campaña se guarda una vez para todos sus destinatarios).

export interface DeleteContactResult {
  messages: number;
  mediaFilesDeleted: number;
}

export async function deleteContactData(contactId: string): Promise<DeleteContactResult | null> {
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: {
      id: true,
      accountId: true,
      remoteJid: true,
      chat: { select: { id: true } },
      conversation: { select: { id: true } },
    },
  });
  if (!contact) return null;

  const chatId = contact.chat?.id ?? null;
  const conversationId = contact.conversation?.id ?? null;

  const [waMedia, channelMedia] = await Promise.all([
    chatId
      ? prisma.wAMessage.findMany({ where: { chatId, mediaUrl: { not: null } }, select: { mediaUrl: true } })
      : Promise.resolve([]),
    conversationId
      ? prisma.channelMessage.findMany({ where: { conversationId, mediaUrl: { not: null } }, select: { mediaUrl: true } })
      : Promise.resolve([]),
  ]);
  const mediaPaths = [...new Set([...waMedia, ...channelMedia].map((m) => m.mediaUrl!))];

  const messages = await prisma.$transaction(async (tx) => {
    const count =
      (chatId ? await tx.wAMessage.count({ where: { chatId } }) : 0) +
      (conversationId ? await tx.channelMessage.count({ where: { conversationId } }) : 0);

    if (contact.accountId) {
      const forms = remoteJidCandidates(contact.remoteJid);
      const campaigns = await tx.wACampaign.findMany({ where: { waAccountId: contact.accountId }, select: { id: true } });
      await tx.wACampaignRecipient.updateMany({
        where: { campaignId: { in: campaigns.map((c) => c.id) }, phoneNumber: { in: forms } },
        data: { contactName: null },
      });
      const sources = await tx.leadSheetSource.findMany({ where: { waAccountId: contact.accountId }, select: { id: true } });
      await tx.leadSheetImportedRow.updateMany({
        where: { sourceId: { in: sources.map((s) => s.id) }, phoneNumber: { in: forms } },
        data: { contactName: null },
      });
    }

    if (chatId) await tx.wAChat.delete({ where: { id: chatId } });
    if (conversationId) await tx.conversation.delete({ where: { id: conversationId } });
    await tx.contact.delete({ where: { id: contactId } });
    return count;
  });

  // Los archivos se quitan DESPUÉS de confirmar la base: si algo falla antes, no
  // se pierde media de un contacto que sigue existiendo. Un archivo que otro
  // mensaje todavía referencia se conserva.
  let mediaFilesDeleted = 0;
  for (const rel of mediaPaths) {
    const [stillUsedWa, stillUsedChannel] = await Promise.all([
      prisma.wAMessage.count({ where: { mediaUrl: rel } }),
      prisma.channelMessage.count({ where: { mediaUrl: rel } }),
    ]);
    if (stillUsedWa + stillUsedChannel > 0) continue;
    try {
      await fs.unlink(resolveAbsolutePath(rel));
      mediaFilesDeleted++;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error(`[contacts/delete] no se pudo borrar el archivo ${rel}:`, err instanceof Error ? err.message : err);
      }
    }
  }

  return { messages, mediaFilesDeleted };
}
