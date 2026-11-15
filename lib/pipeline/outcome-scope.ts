// Ventas ganadas/perdidas (LeadOutcomeEvent) que una persona puede ver.
//
// Borrar un contacto conserva sus eventos (contactId → null, 2026-11-15) con
// una foto del contacto: nombre, número y la cuenta de la que colgaba. Mientras
// el contacto existe, el alcance es el de sus contactos (buildContactScope);
// cuando ya no, el de la cuenta guardada en la foto. Puras, con pruebas.

import { buildContactScope, type ContactScopeInput } from "@/lib/contacts/scope";

export function outcomeScopeWhere(input: ContactScopeInput): { OR: Record<string, unknown>[] } {
  const deleted: Record<string, unknown>[] = [
    { contactAccountId: { in: input.accountIds } },
    { contactChannelAccountId: { in: input.channelAccountIds } },
  ];
  if (input.isAdmin && input.organizationId) {
    deleted.push({ contactAccountId: null, contactChannelAccountId: null, organizationId: input.organizationId });
  }
  return { OR: [{ contact: buildContactScope(input) }, { contactId: null, OR: deleted }] };
}

/** Foto del contacto que se guarda en cada evento de resultado. */
export function outcomeContactSnapshot(contact: {
  name: string | null;
  remoteJid: string;
  accountId: string | null;
  channelAccountId: string | null;
}) {
  return {
    contactName: contact.name,
    // En canales genéricos remoteJid es un id externo, no un teléfono.
    contactPhone: contact.channelAccountId ? null : contact.remoteJid.split("@")[0] || null,
    contactAccountId: contact.accountId,
    contactChannelAccountId: contact.channelAccountId,
  };
}
