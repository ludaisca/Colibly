import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ApiContext } from "./auth";
import { ApiError } from "./respond";
import { contactScopeWhere } from "./resources";
import { dealScopeWhere } from "./deals";

// Personas, empresas y tareas en la API pública. Una key sin recorte de cuentas
// ve todo lo de su organización; una recortada solo lo que cuelga de sus
// cuentas: personas con un canal en ellas, las empresas de esas personas y las
// tareas ligadas a ellas o a sus negocios. Un id fuera de alcance responde 404.

export function personScopeWhere(ctx: ApiContext): Prisma.PersonWhereInput {
  return { organizationId: ctx.organizationId, ...(ctx.restricted ? { contacts: { some: contactScopeWhere(ctx) } } : {}) };
}

export function companyScopeWhere(ctx: ApiContext): Prisma.CompanyWhereInput {
  return { organizationId: ctx.organizationId, ...(ctx.restricted ? { people: { some: { contacts: { some: contactScopeWhere(ctx) } } } } : {}) };
}

export function taskScopeWhere(ctx: ApiContext): Prisma.TaskWhereInput {
  if (!ctx.restricted) return { organizationId: ctx.organizationId };
  return {
    organizationId: ctx.organizationId,
    OR: [{ person: personScopeWhere(ctx) }, { company: companyScopeWhere(ctx) }, { deal: dealScopeWhere(ctx) }],
  };
}

// Crear personas/empresas sin canal las dejaría fuera del alcance de la propia
// key que las creó; una key recortada no puede.
export function assertUnrestricted(ctx: ApiContext, what: string): void {
  if (ctx.restricted) throw new ApiError(403, "forbidden", `Una API key limitada a ciertas cuentas no puede ${what}`);
}

// ── Personas ────────────────────────────────────────────────────────────────

export function personSelect(ctx: ApiContext) {
  return {
    id: true,
    name: true,
    email: true,
    phone: true,
    jobTitle: true,
    lifecycle: true,
    source: true,
    ownerId: true,
    version: true,
    archivedAt: true,
    createdAt: true,
    updatedAt: true,
    company: { select: { id: true, name: true } },
    contacts: {
      where: contactScopeWhere(ctx),
      orderBy: { createdAt: "asc" as const },
      take: 20,
      select: { id: true, accountId: true, channelAccountId: true, channelAccount: { select: { channel: true } } },
    },
  } satisfies Prisma.PersonSelect;
}

type PersonRow = Prisma.PersonGetPayload<{ select: ReturnType<typeof personSelect> }>;

export function serializePerson(p: PersonRow) {
  const { contacts, ...rest } = p;
  return {
    ...rest,
    // Identidades de canal (los `id` son los de /contacts y /conversations).
    channels: contacts.map((c) => ({ contactId: c.id, accountId: c.accountId ?? c.channelAccountId, channel: c.accountId ? "WHATSAPP" : c.channelAccount?.channel ?? null })),
  };
}

export async function findScopedPerson(ctx: ApiContext, id: string) {
  const p = await prisma.person.findFirst({ where: { id, ...personScopeWhere(ctx) }, select: personSelect(ctx) });
  if (!p) throw new ApiError(404, "not_found", "Contacto no encontrado");
  return p;
}

// ── Empresas ────────────────────────────────────────────────────────────────

export const companySelect = {
  id: true,
  name: true,
  domain: true,
  industry: true,
  size: true,
  location: true,
  notes: true,
  ownerId: true,
  version: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { people: { where: { archivedAt: null } } } },
} satisfies Prisma.CompanySelect;

type CompanyRow = Prisma.CompanyGetPayload<{ select: typeof companySelect }>;

export function serializeCompany({ _count, ...c }: CompanyRow) {
  return { ...c, peopleCount: _count.people };
}

export async function findScopedCompany(ctx: ApiContext, id: string) {
  const c = await prisma.company.findFirst({ where: { id, ...companyScopeWhere(ctx) }, select: companySelect });
  if (!c) throw new ApiError(404, "not_found", "Empresa no encontrada");
  return c;
}

// ── Tareas ──────────────────────────────────────────────────────────────────

export const API_TASK_SELECT = {
  id: true,
  title: true,
  notes: true,
  kind: true,
  status: true,
  dueAt: true,
  remindMinutesBefore: true,
  completedAt: true,
  assigneeId: true,
  personId: true,
  companyId: true,
  dealId: true,
  source: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TaskSelect;

type TaskRow = Prisma.TaskGetPayload<{ select: typeof API_TASK_SELECT }>;

export const serializeApiTask = (t: TaskRow) => ({ ...t, overdue: t.status === "OPEN" && !!t.dueAt && t.dueAt < new Date() });

export async function findScopedTask(ctx: ApiContext, id: string) {
  const t = await prisma.task.findFirst({ where: { id, ...taskScopeWhere(ctx) }, select: API_TASK_SELECT });
  if (!t) throw new ApiError(404, "not_found", "Tarea no encontrada");
  return t;
}

// El objetivo de una tarea nueva debe estar dentro del alcance de la key.
export async function assertTaskTargetInScope(ctx: ApiContext, target: { personId?: string | null; companyId?: string | null; dealId?: string | null }) {
  if (target.personId) await findScopedPerson(ctx, target.personId);
  if (target.companyId) await findScopedCompany(ctx, target.companyId);
  if (target.dealId && !(await prisma.deal.findFirst({ where: { id: target.dealId, ...dealScopeWhere(ctx) }, select: { id: true } }))) {
    throw new ApiError(404, "not_found", "Negocio no encontrado");
  }
}
