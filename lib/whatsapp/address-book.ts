import { prisma } from "@/lib/prisma";
import { isFallbackName, shouldUpdateName } from "@/lib/whatsapp/contact-name";
import { jidCandidates } from "@/lib/whatsapp/coexistence/normalize";

// Quién puso Contact.name (ver Contact.nameSource en el schema).
export type NameSource = "user" | "address_book" | null;

// Contactos nacidos de WhatsApp (Contact.source).
export type ContactSource = "whatsapp_inbound" | "whatsapp_history" | "whatsapp_echo";

interface ExistingName {
  name: string | null;
  nameSource: string | null;
  remoteJid: string;
}

// Regla de nombres, de mayor a menor prioridad:
//  1. lo que el usuario editó en Colibly (o por la API) nunca se pisa;
//  2. la libreta de la app WhatsApp Business (como lo guardó el negocio) pisa
//     el perfil de WhatsApp y el número, y se actualiza si cambia en la libreta;
//  3. el nombre de perfil de WhatsApp solo llena un número o un perfil anterior.
export function shouldApplyAddressBookName(incoming: string | null | undefined, existing: ExistingName): boolean {
  if (existing.nameSource === "user") return false;
  if (!incoming || isFallbackName(incoming, existing.remoteJid)) return false;
  return incoming !== existing.name;
}

export function shouldApplyProfileName(incoming: string | null | undefined, existing: ExistingName | null): boolean {
  if (existing && (existing.nameSource === "user" || existing.nameSource === "address_book")) return false;
  return shouldUpdateName(incoming, existing?.name, existing?.remoteJid ?? "");
}

// Nombre guardado en la libreta para un número (52…/521… para México).
export async function addressBookNameFor(accountId: string, phone: string): Promise<string | null> {
  const candidates = jidCandidates(phone.split("@")[0]);
  if (candidates.length === 0) return null;
  const entry = await prisma.wAAddressBookEntry.findFirst({
    where: { accountId, phone: { in: candidates } },
    select: { name: true },
  });
  return entry?.name ?? null;
}

// Ya es contacto: la entrada de la libreta deja de hacer falta.
export async function forgetAddressBookEntry(accountId: string, phone: string): Promise<void> {
  const candidates = jidCandidates(phone.split("@")[0]);
  if (candidates.length === 0) return;
  await prisma.wAAddressBookEntry.deleteMany({ where: { accountId, phone: { in: candidates } } });
}
