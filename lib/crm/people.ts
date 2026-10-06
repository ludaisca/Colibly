import { Prisma, type PersonLifecycle } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserAccountIds, getUserChannelAccountIds } from "@/lib/shared-accounts";
import { evaluatePlanLimit } from "@/lib/billing/gates";
import { deleteContactData } from "@/lib/contacts/delete";
import { CrmError, invalid, notFound, versionConflict } from "@/lib/crm/errors";
import { assertCanEdit, isRestricted, requireRoles, type CrmActor } from "@/lib/crm/access";
import { logActivity } from "@/lib/crm/activity";
import { cleanText, normalizeEmail, normalizePersonPhone, phoneForms } from "@/lib/crm/normalize";
import { findDuplicateClusters } from "@/lib/crm/duplicates";
import { diffFields } from "@/lib/crm/merge-fields";
import {
  bulkSchema,
  personCreateSchema,
  personUpdateSchema,
  peopleFiltersSchema,
  type PeopleFilters,
} from "@/lib/crm/schemas";

// Servicio de PERSONAS ("Contactos" en la interfaz). Directorio compartido de la
// organización: `organizationId` es siempre el alcance. Los canales (Contact) se
// muestran solo los de cuentas a las que el actor tiene acceso.

const personRowSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  jobTitle: true,
  lifecycle: true,
  source: true,
  version: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  companyId: true,
  ownerId: true,
  company: { select: { id: true, name: true } },
  owner: { select: { id: true, name: true } },
} satisfies Prisma.PersonSelect;

// Contactos (identidades de canal) que el actor puede ver.
export async function accessibleContacts(actor: CrmActor): Promise<Prisma.ContactWhereInput> {
  const [wa, ch] = await Promise.all([getUserAccountIds(actor.userId), getUserChannelAccountIds(actor.userId)]);
  return { OR: [{ accountId: { in: wa } }, { channelAccountId: { in: ch } }] };
}

async function loadPerson(organizationId: string, id: string) {
  const person = await prisma.person.findFirst({ where: { id, organizationId } });
  if (!person) throw notFound("Contacto");
  return person;
}

export async function validateOwner(organizationId: string, ownerId: string): Promise<void> {
  const ok = await prisma.user.findFirst({ where: { id: ownerId, organizationId, disabledAt: null }, select: { id: true } });
  if (!ok) throw invalid("El responsable debe ser un usuario activo de tu organización");
}

export async function validateCompany(organizationId: string, companyId: string): Promise<void> {
  const ok = await prisma.company.findFirst({ where: { id: companyId, organizationId, archivedAt: null }, select: { id: true } });
  if (!ok) throw invalid("La empresa no existe o está archivada");
}

// Personas activas que ya usan ese correo o teléfono (52…/521… cuentan igual).
export async function findPersonMatches(organizationId: string, email: string | null, phoneDigits: string | null, excludeId?: string) {
  const or: Prisma.PersonWhereInput[] = [];
  if (email) or.push({ email });
  const forms = phoneForms(phoneDigits);
  if (forms.length) or.push({ phoneDigits: { in: forms } });
  if (!or.length) return [];
  const rows = await prisma.person.findMany({
    where: { organizationId, archivedAt: null, OR: or, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true, name: true, email: true, phone: true, phoneDigits: true },
    take: 5,
  });
  const forSet = new Set(forms);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    reasons: [...(email && r.email === email ? ["email"] : []), ...(r.phoneDigits && forSet.has(r.phoneDigits) ? ["phone"] : [])],
  }));
}

export async function createPerson(actor: CrmActor, raw: unknown) {
  const input = personCreateSchema.parse(raw);
  const email = normalizeEmail(input.email);
  if (email.invalid) throw invalid("El correo no es válido");
  const phone = normalizePersonPhone(input.phone);
  if (phone.invalid) throw invalid("El teléfono no es válido (usa de 7 a 15 dígitos)");

  // El ejecutivo siempre queda como responsable de lo que crea.
  const ownerId = isRestricted(actor) ? actor.userId : input.ownerId ?? null;
  if (ownerId) await validateOwner(actor.organizationId, ownerId);
  if (input.companyId) await validateCompany(actor.organizationId, input.companyId);

  if (!input.allowDuplicate) {
    const matches = await findPersonMatches(actor.organizationId, email.email, phone.phoneDigits);
    if (matches.length) {
      throw new CrmError(409, "duplicate_person", "Ya existe un contacto con ese correo o teléfono", { matches });
    }
  }
  const exceeded = await evaluatePlanLimit(actor.organizationId, "contacts");
  if (exceeded) throw new CrmError(402, "plan_limit", exceeded.message, { limit: "contacts", current: exceeded.current, max: exceeded.max });

  return prisma.$transaction(async (tx) => {
    const person = await tx.person.create({
      data: {
        organizationId: actor.organizationId,
        name: input.name,
        email: email.email,
        phone: phone.phone,
        phoneDigits: phone.phoneDigits,
        jobTitle: cleanText(input.jobTitle, 120),
        companyId: input.companyId ?? null,
        ownerId,
        lifecycle: input.lifecycle ?? "LEAD",
        source: "manual",
      },
      select: personRowSelect,
    });
    await logActivity(tx, { organizationId: actor.organizationId, actorId: actor.userId, type: "person.created", personId: person.id, data: { source: "manual" } });
    return person;
  });
}

const EDITABLE = ["name", "email", "phone", "phoneDigits", "jobTitle", "companyId", "lifecycle"] as const;

export async function updatePerson(actor: CrmActor, id: string, raw: unknown) {
  const input = personUpdateSchema.parse(raw);
  const person = await loadPerson(actor.organizationId, id);
  assertCanEdit(actor, person);

  const data: Prisma.PersonUncheckedUpdateInput = {};
  const patch: Partial<Record<(typeof EDITABLE)[number], unknown>> = {};

  if (input.name !== undefined) patch.name = input.name;
  if (input.email !== undefined) {
    const e = normalizeEmail(input.email);
    if (e.invalid) throw invalid("El correo no es válido");
    patch.email = e.email;
  }
  if (input.phone !== undefined) {
    const p = normalizePersonPhone(input.phone);
    if (p.invalid) throw invalid("El teléfono no es válido (usa de 7 a 15 dígitos)");
    patch.phone = p.phone;
    patch.phoneDigits = p.phoneDigits;
  }
  if (input.jobTitle !== undefined) patch.jobTitle = cleanText(input.jobTitle, 120);
  if (input.companyId !== undefined) {
    if (input.companyId) await validateCompany(actor.organizationId, input.companyId);
    patch.companyId = input.companyId;
  }
  if (input.lifecycle !== undefined) patch.lifecycle = input.lifecycle as PersonLifecycle;
  Object.assign(data, patch);

  const ownerChanged = input.ownerId !== undefined && input.ownerId !== person.ownerId;
  if (ownerChanged) {
    requireRoles(actor, ["admin", "user"]);
    if (input.ownerId) await validateOwner(actor.organizationId, input.ownerId);
    data.ownerId = input.ownerId;
  }
  const archiveChanged = input.archived !== undefined && input.archived !== !!person.archivedAt;
  if (archiveChanged) {
    requireRoles(actor, ["admin", "user"]);
    data.archivedAt = input.archived ? new Date() : null;
  }

  const changes = diffFields(person as unknown as Record<string, unknown>, patch, EDITABLE);
  if (!Object.keys(changes).length && !ownerChanged && !archiveChanged) {
    return prisma.person.findUniqueOrThrow({ where: { id }, select: personRowSelect });
  }

  return prisma.$transaction(async (tx) => {
    // Control de concurrencia: solo escribe si nadie cambió el registro desde
    // la versión que vio quien edita.
    const res = await tx.person.updateMany({
      where: { id, organizationId: actor.organizationId, version: input.expectedVersion },
      data: { ...data, version: { increment: 1 } },
    });
    if (res.count === 0) {
      throw versionConflict(await tx.person.findUnique({ where: { id }, select: personRowSelect }));
    }
    const base = { organizationId: actor.organizationId, actorId: actor.userId, personId: id };
    if (Object.keys(changes).length) await logActivity(tx, { ...base, type: "person.updated", data: { changes } as Prisma.InputJsonValue });
    if (ownerChanged) await logActivity(tx, { ...base, type: "person.owner_changed", data: { from: person.ownerId, to: input.ownerId ?? null } });
    if (archiveChanged) await logActivity(tx, { ...base, type: input.archived ? "person.archived" : "person.restored" });
    return tx.person.findUniqueOrThrow({ where: { id }, select: personRowSelect });
  });
}

// Borrado DEFINITIVO (derecho de cancelación): solo admin. Borra primero cada
// identidad de canal con su chat, mensajes y media, y al final la persona (y su
// historial, por cascada).
export async function deletePerson(actor: CrmActor, id: string) {
  requireRoles(actor, ["admin"]);
  const person = await loadPerson(actor.organizationId, id);
  const contacts = await prisma.contact.findMany({ where: { personId: id }, select: { id: true } });
  let messages = 0;
  for (const c of contacts) messages += (await deleteContactData(c.id))?.messages ?? 0;
  await prisma.person.delete({ where: { id: person.id } });
  return { contacts: contacts.length, messages };
}

// ── Listado ────────────────────────────────────────────────────────────────

export async function buildPeopleWhere(actor: CrmActor, f: PeopleFilters): Promise<Prisma.PersonWhereInput> {
  const and: Prisma.PersonWhereInput[] = [{ organizationId: actor.organizationId }];
  if (f.archived === "only") and.push({ archivedAt: { not: null } });
  else if (f.archived !== "include") and.push({ archivedAt: null });

  if (f.q) {
    const digits = f.q.replace(/\D/g, "");
    const or: Prisma.PersonWhereInput[] = [
      { name: { contains: f.q, mode: "insensitive" } },
      { email: { contains: f.q, mode: "insensitive" } },
      { jobTitle: { contains: f.q, mode: "insensitive" } },
      { company: { name: { contains: f.q, mode: "insensitive" } } },
    ];
    if (digits.length >= 3) or.push({ phoneDigits: { contains: digits } });
    and.push({ OR: or });
  }
  if (f.ownerId === "none") and.push({ ownerId: null });
  else if (f.ownerId === "me") and.push({ ownerId: actor.userId });
  else if (f.ownerId) and.push({ ownerId: f.ownerId });
  if (f.companyId === "none") and.push({ companyId: null });
  else if (f.companyId) and.push({ companyId: f.companyId });
  if (f.lifecycle) and.push({ lifecycle: f.lifecycle });
  if (f.createdFrom) and.push({ createdAt: { gte: new Date(f.createdFrom) } });
  if (f.createdTo) and.push({ createdAt: { lte: new Date(f.createdTo) } });

  const scope = await accessibleContacts(actor);
  if (f.channel) {
    const channelWhere: Prisma.ContactWhereInput = f.channel === "WHATSAPP" ? { accountId: { not: null } } : { channelAccount: { channel: f.channel } };
    and.push({ contacts: { some: { AND: [scope, channelWhere] } } });
  }
  if (f.tagId) and.push({ contacts: { some: { AND: [scope, { tags: { some: { tagId: f.tagId } } }] } } });
  return { AND: and };
}

const orderFor = (sort: PeopleFilters["sort"]): Prisma.PersonOrderByWithRelationInput[] =>
  sort === "name" ? [{ name: "asc" }, { id: "asc" }] : sort === "newest" ? [{ createdAt: "desc" }, { id: "desc" }] : [{ updatedAt: "desc" }, { id: "desc" }];

export async function listPeople(actor: CrmActor, rawFilters: unknown, page: { page: number; pageSize: number }) {
  const f = peopleFiltersSchema.parse(rawFilters);
  const where = await buildPeopleWhere(actor, f);
  const scope = await accessibleContacts(actor);
  const [rows, total] = await Promise.all([
    prisma.person.findMany({
      where,
      select: {
        ...personRowSelect,
        contacts: {
          where: scope,
          take: 10,
          select: {
            accountId: true,
            channelAccount: { select: { channel: true } },
            chat: { select: { lastMessageAt: true, unreadCount: true } },
            conversation: { select: { lastMessageAt: true, unreadCount: true } },
          },
        },
      },
      orderBy: orderFor(f.sort),
      skip: (page.page - 1) * page.pageSize,
      take: page.pageSize,
    }),
    prisma.person.count({ where }),
  ]);
  const items = rows.map(({ contacts, ...p }) => {
    const channels = new Set<string>();
    let lastMessageAt: Date | null = null;
    let unreadCount = 0;
    for (const c of contacts) {
      channels.add(c.accountId ? "WHATSAPP" : c.channelAccount?.channel ?? "WEBCHAT");
      const t = c.chat ?? c.conversation;
      if (t?.lastMessageAt && (!lastMessageAt || t.lastMessageAt > lastMessageAt)) lastMessageAt = t.lastMessageAt;
      unreadCount += t?.unreadCount ?? 0;
    }
    return { ...p, channels: [...channels].sort(), lastMessageAt, unreadCount };
  });
  return { items, total, page: page.page, pageSize: page.pageSize };
}

// ── Ficha ──────────────────────────────────────────────────────────────────

export async function getPersonDetail(actor: CrmActor, id: string) {
  const person = await prisma.person.findFirst({
    where: { id, organizationId: actor.organizationId },
    select: personRowSelect,
  });
  if (!person) throw notFound("Contacto");
  const scope = await accessibleContacts(actor);

  const [contacts, appointments, activity, deals] = await Promise.all([
    prisma.contact.findMany({
      where: { AND: [{ personId: id }, scope] },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        accountId: true,
        channelAccountId: true,
        remoteJid: true,
        name: true,
        leadOrigin: true,
        optedOutMarketing: true,
        createdAt: true,
        account: { select: { name: true } },
        channelAccount: { select: { name: true, channel: true } },
        chat: { select: { id: true, status: true, lastMessageAt: true, unreadCount: true } },
        conversation: { select: { id: true, status: true, lastMessageAt: true, unreadCount: true } },
        tags: { select: { tag: { select: { id: true, name: true, color: true } } } },
        _count: { select: { notes: true } },
      },
    }),
    prisma.wAAppointment.findMany({
      where: {
        contact: { AND: [{ personId: id }, scope] },
        status: "SCHEDULED",
        scheduledAt: { gte: new Date() },
        // El ejecutivo solo ve las citas que tiene asignadas.
        ...(isRestricted(actor) ? { assignedToId: actor.userId } : {}),
      },
      orderBy: { scheduledAt: "asc" },
      take: 5,
      select: { id: true, title: true, scheduledAt: true, durationMinutes: true, assignedToId: true, contactId: true },
    }),
    prisma.activityLog.findMany({
      where: { organizationId: actor.organizationId, personId: id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 20,
      select: { id: true, type: true, data: true, createdAt: true, actor: { select: { id: true, name: true } } },
    }),
    // Negocios abiertos y los últimos cerrados; el ejecutivo solo los suyos.
    prisma.deal.findMany({
      where: { organizationId: actor.organizationId, personId: id, archivedAt: null, ...(isRestricted(actor) ? { ownerId: actor.userId } : {}) },
      orderBy: [{ status: "asc" }, { stageEnteredAt: "desc" }],
      take: 20,
      select: { id: true, title: true, amount: true, status: true, ownerId: true, closedAt: true, stageEnteredAt: true, stage: { select: { id: true, name: true, color: true } }, pipeline: { select: { id: true, name: true } } },
    }),
  ]);

  return {
    ...person,
    canEdit: !isRestricted(actor) || person.ownerId === actor.userId,
    contacts: contacts.map(({ account, channelAccount, chat, conversation, tags, _count, ...c }) => ({
      ...c,
      channel: c.accountId ? "WHATSAPP" : channelAccount?.channel ?? "WEBCHAT",
      accountName: account?.name ?? channelAccount?.name ?? null,
      thread: chat ? { kind: "whatsapp" as const, ...chat } : conversation ? { kind: "channel" as const, ...conversation } : null,
      tags: tags.map((t) => t.tag),
      notes: _count.notes,
    })),
    deals: deals.map((d) => ({ ...d, amount: Number(d.amount) })),
    upcomingAppointments: appointments,
    activity,
  };
}

// ── Acciones en lote ───────────────────────────────────────────────────────

export async function bulkPeople(actor: CrmActor, raw: unknown) {
  requireRoles(actor, ["admin", "user"]);
  const input = bulkSchema.parse(raw);
  const ids = [...new Set(input.ids)];

  if (input.action === "assign_owner") {
    if (input.ownerId === undefined) throw invalid("Indica el responsable (o null para quitarlo)");
    if (input.ownerId) await validateOwner(actor.organizationId, input.ownerId);
  }
  if (input.action === "set_company") {
    if (input.companyId === undefined) throw invalid("Indica la empresa (o null para quitarla)");
    if (input.companyId) await validateCompany(actor.organizationId, input.companyId);
  }

  const people = await prisma.person.findMany({ where: { id: { in: ids }, organizationId: actor.organizationId }, select: { id: true, ownerId: true, companyId: true, archivedAt: true } });
  let updated = 0;
  await prisma.$transaction(async (tx) => {
    for (const p of people) {
      const base = { organizationId: actor.organizationId, actorId: actor.userId, personId: p.id };
      if (input.action === "assign_owner") {
        if (p.ownerId === (input.ownerId ?? null)) continue;
        await tx.person.update({ where: { id: p.id }, data: { ownerId: input.ownerId ?? null, version: { increment: 1 } } });
        await logActivity(tx, { ...base, type: "person.owner_changed", data: { from: p.ownerId, to: input.ownerId ?? null, bulk: true } });
      } else if (input.action === "set_company") {
        if (p.companyId === (input.companyId ?? null)) continue;
        await tx.person.update({ where: { id: p.id }, data: { companyId: input.companyId ?? null, version: { increment: 1 } } });
        await logActivity(tx, { ...base, type: "person.updated", data: { changes: { companyId: [p.companyId, input.companyId ?? null] }, bulk: true } });
      } else if (input.action === "archive") {
        if (p.archivedAt) continue;
        await tx.person.update({ where: { id: p.id }, data: { archivedAt: new Date(), version: { increment: 1 } } });
        await logActivity(tx, { ...base, type: "person.archived", data: { bulk: true } });
      } else {
        if (!p.archivedAt) continue;
        await tx.person.update({ where: { id: p.id }, data: { archivedAt: null, version: { increment: 1 } } });
        await logActivity(tx, { ...base, type: "person.restored", data: { bulk: true } });
      }
      updated++;
    }
  });
  return { requested: ids.length, found: people.length, updated };
}

// ── Duplicados ─────────────────────────────────────────────────────────────

export async function listDuplicateClusters(actor: CrmActor) {
  requireRoles(actor, ["admin", "user"]);
  const people = await prisma.person.findMany({
    where: { organizationId: actor.organizationId, archivedAt: null, OR: [{ email: { not: null } }, { phoneDigits: { not: null } }] },
    select: { id: true, name: true, email: true, phone: true, phoneDigits: true, createdAt: true, _count: { select: { contacts: true } } },
    take: 20000,
  });
  const byId = new Map(people.map((p) => [p.id, p] as const));
  const clusters = findDuplicateClusters(people).slice(0, 100);
  return {
    clusters: clusters.map((c) => ({
      reasons: c.reasons,
      people: c.ids.map((id) => {
        const p = byId.get(id)!;
        return { id: p.id, name: p.name, email: p.email, phone: p.phone, channels: p._count.contacts, createdAt: p.createdAt };
      }),
    })),
  };
}

export async function listTeam(actor: CrmActor) {
  return prisma.user.findMany({
    where: { organizationId: actor.organizationId, disabledAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, role: true },
  });
}
