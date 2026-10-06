import { Prisma, type Contact, type LeadStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { jidCandidates } from "@/lib/phone";
import { shouldUpdateName } from "@/lib/whatsapp/contact-name";
import { canonicalRemoteJid, isPhoneJid, isPhoneNameOf, remoteJidCandidates } from "@/lib/contacts/jid";
import { phoneForms } from "@/lib/crm/normalize";
import { logActivity } from "@/lib/crm/activity";

// ÚNICO punto de alta/búsqueda de `Contact`. Antes cada ingesta (mensaje de
// WhatsApp, Telegram/Meta, campañas, hojas de Google, Instant Forms, API,
// coexistencia) hacía su propio `upsert` con el número crudo, y un mismo móvil
// mexicano (52… / 521…) terminaba en dos contactos y dos chats. Todo lo que
// cree o busque un contacto por teléfono o id de canal pasa por aquí.

export type ContactScope =
  | { kind: "whatsapp"; accountId: string }
  | { kind: "channel"; channelAccountId: string };

// Atribución "first-touch": solo se escribe al CREAR el contacto, nunca en
// actualizaciones posteriores (un segundo toque no pisa el origen real).
export type ContactAttribution = Pick<
  Prisma.ContactUncheckedCreateInput,
  "leadOrigin" | "ctwaClid" | "adId" | "metaLeadId" | "metaAdsAccountId"
>;

export interface ResolveContactInput {
  // Teléfono (dígitos) o id del canal tal como llegó.
  remoteJid: string;
  // Nombre que trae la fuente; null/undefined = la fuente no trae nombre.
  name?: string | null;
  attribution?: ContactAttribution;
  // Etapa inicial; solo al crear (por defecto NEW).
  leadStatus?: LeadStatus;
}

export interface ResolvedContact {
  contact: Contact;
  // Identificador con el que ya existe (o se creó) el contacto: usarlo también
  // para el WAChat/Conversation, nunca el crudo.
  remoteJid: string;
  created: boolean;
  // true si ya existía y su nombre se actualizó con esta llamada.
  nameChanged: boolean;
}

function scopeWhere(scope: ContactScope) {
  return scope.kind === "whatsapp" ? { accountId: scope.accountId } : { channelAccountId: scope.channelAccountId };
}

// Identificador canónico sin crear nada: el que ya usa la base para esa persona
// o, si es nueva, el que llegó.
export async function resolveRemoteJid(scope: ContactScope, rawRemoteJid: string): Promise<string> {
  const raw = rawRemoteJid.trim();
  if (scope.kind !== "whatsapp" || !isPhoneJid(raw)) return raw;
  const candidates = jidCandidates(raw);
  const [contact, chat] = await Promise.all([
    prisma.contact.findFirst({ where: { accountId: scope.accountId, remoteJid: { in: candidates } }, select: { remoteJid: true } }),
    prisma.wAChat.findFirst({ where: { accountId: scope.accountId, remoteJid: { in: candidates } }, select: { remoteJid: true } }),
  ]);
  return canonicalRemoteJid(raw, [contact?.remoteJid, chat?.remoteJid]);
}

export async function findContact(scope: ContactScope, rawRemoteJid: string): Promise<Contact | null> {
  const remoteJid = await resolveRemoteJid(scope, rawRemoteJid);
  return prisma.contact.findFirst({ where: { ...scopeWhere(scope), remoteJid } });
}

export async function resolveContact(scope: ContactScope, input: ResolveContactInput): Promise<ResolvedContact> {
  const remoteJid = await resolveRemoteJid(scope, input.remoteJid);
  const where = { ...scopeWhere(scope), remoteJid };

  const existing = await prisma.contact.findFirst({ where });
  if (existing) {
    const contact = await refreshName(existing, input.name);
    return { contact, remoteJid, created: false, nameChanged: contact.name !== existing.name };
  }

  const { organizationId, source } = await scopeOrigin(scope);
  try {
    const contact = await prisma.$transaction(async (tx) => {
      // Cada identidad de canal pertenece a una Person (el "Contacto" de la
      // interfaz). Si ya hay una con ese teléfono (p. ej. importada por CSV) se
      // reutiliza; si no, se crea. Todo en la misma transacción que el Contact.
      const phone = scope.kind === "whatsapp" && isPhoneJid(remoteJid) ? remoteJid : null;
      const existingPerson = phone
        ? await tx.person.findFirst({
            where: { organizationId, archivedAt: null, phoneDigits: { in: phoneForms(phone) } },
            orderBy: { createdAt: "asc" },
            select: { id: true },
          })
        : null;
      const personId =
        existingPerson?.id ??
        (
          await tx.person.create({
            data: { organizationId, name: input.name ?? remoteJid, phone, phoneDigits: phone, source },
            select: { id: true },
          })
        ).id;
      await logActivity(tx, {
        organizationId,
        actorId: null,
        type: existingPerson ? "person.channel_linked" : "person.created",
        personId,
        data: { source, remoteJid },
      });
      return tx.contact.create({
        data: { ...where, personId, name: input.name ?? remoteJid, ...(input.leadStatus ? { leadStatus: input.leadStatus } : {}), ...(input.attribution ?? {}) },
      });
    });
    return { contact, remoteJid, created: true, nameChanged: false };
  } catch (err) {
    // Carrera entre dos entregas del mismo contacto: la otra ganó el @@unique
    // (la transacción entera se revierte, incluida la Person).
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const winner = await prisma.contact.findFirstOrThrow({ where });
      const contact = await refreshName(winner, input.name);
      return { contact, remoteJid, created: false, nameChanged: contact.name !== winner.name };
    }
    throw err;
  }
}

// Organización y origen ("whatsapp", "telegram"…) de la cuenta dueña del scope.
async function scopeOrigin(scope: ContactScope): Promise<{ organizationId: string; source: string }> {
  if (scope.kind === "whatsapp") {
    const a = await prisma.wAAccount.findUniqueOrThrow({ where: { id: scope.accountId }, select: { organizationId: true } });
    return { organizationId: a.organizationId, source: "whatsapp" };
  }
  const a = await prisma.channelAccount.findUniqueOrThrow({
    where: { id: scope.channelAccountId },
    select: { organizationId: true, channel: true },
  });
  return { organizationId: a.organizationId, source: a.channel.toLowerCase() };
}

// El nombre nunca retrocede: un nombre real guardado no se pisa con un
// fallback (el teléfono), pero un fallback sí se actualiza a un nombre real.
async function refreshName(contact: Contact, incoming: string | null | undefined): Promise<Contact> {
  if (!incoming || isPhoneNameOf(incoming, contact.remoteJid)) return contact;
  if (!shouldUpdateName(incoming, contact.name, contact.remoteJid)) return contact;
  if (incoming === contact.name) return contact;
  const updated = await prisma.contact.update({ where: { id: contact.id }, data: { name: incoming } });
  // La Person conserva el nombre de su identidad de canal mientras nadie lo
  // haya editado a mano: solo se actualiza si todavía tenía el nombre anterior
  // o el teléfono como nombre.
  const placeholders = [contact.name, ...remoteJidCandidates(contact.remoteJid)].filter((n): n is string => !!n);
  await prisma.person.updateMany({ where: { id: contact.personId, name: { in: placeholders } }, data: { name: incoming } });
  return updated;
}
