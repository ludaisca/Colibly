import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { normalizeTeamName, TEAMS_PER_ORG_MAX } from "./rules";

// Equipos de la organización (Ventas, Soporte…). Agrupan personas para
// enrutar chats: el equipo de un chat limita la autoasignación a sus miembros
// y alimenta la vista "Mis equipos" de la bandeja. NO da permisos: quién ve
// una cuenta sigue siendo admin / dueño / compartida. Cada cuenta puede tener
// un equipo por defecto (los chats nuevos de ese número entran a él).

export interface TeamView {
  id: string;
  name: string;
  members: Array<{ id: string; name: string | null; email: string }>;
  accounts: Array<{ id: string; name: string; channel: string }>;
  openChats: number;
}

export class TeamError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

export async function listTeams(organizationId: string): Promise<TeamView[]> {
  const teams = await prisma.team.findMany({
    where: { organizationId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      members: { select: { user: { select: { id: true, name: true, email: true, disabledAt: true } } }, orderBy: { createdAt: "asc" } },
      waAccounts: { select: { id: true, name: true } },
      channelAccounts: { select: { id: true, name: true, channel: true } },
      _count: { select: { chats: { where: { status: { in: ["OPEN", "PENDING"] } } }, conversations: { where: { status: { in: ["OPEN", "PENDING"] } } } } },
    },
  });
  return teams.map((t) => ({
    id: t.id,
    name: t.name,
    members: t.members.filter((m) => !m.user.disabledAt).map((m) => ({ id: m.user.id, name: m.user.name, email: m.user.email })),
    accounts: [...t.waAccounts.map((a) => ({ id: a.id, name: a.name, channel: "WHATSAPP" })), ...t.channelAccounts.map((a) => ({ ...a, channel: String(a.channel) }))],
    openChats: t._count.chats + t._count.conversations,
  }));
}

/** Lo que necesita el modal de equipos: personas activas y cuentas de la organización. */
export async function teamFormOptions(organizationId: string) {
  const [people, wa, ch] = await Promise.all([
    prisma.user.findMany({ where: { organizationId, disabledAt: null }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, email: true, role: true } }),
    prisma.wAAccount.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, defaultTeamId: true } }),
    prisma.channelAccount.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, channel: true, defaultTeamId: true } }),
  ]);
  return {
    people,
    accounts: [
      ...wa.map((a) => ({ id: a.id, name: a.name, channel: "WHATSAPP", defaultTeamId: a.defaultTeamId })),
      ...ch.map((a) => ({ id: a.id, name: a.name, channel: String(a.channel), defaultTeamId: a.defaultTeamId })),
    ],
  };
}

/** Equipos (id + nombre) para los selectores de la bandeja: cualquier rol de la organización. */
export async function teamOptions(organizationId: string): Promise<Array<{ id: string; name: string }>> {
  return prisma.team.findMany({ where: { organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true } });
}

/** ¿El equipo es de esta organización? (nunca confiar en un teamId del cliente). */
export async function teamBelongsTo(organizationId: string, teamId: string): Promise<boolean> {
  return (await prisma.team.count({ where: { id: teamId, organizationId } })) === 1;
}

/** Equipos a los que pertenece la persona. */
export async function userTeamIds(userId: string): Promise<string[]> {
  const rows = await prisma.teamMember.findMany({ where: { userId }, select: { teamId: true } });
  return rows.map((r) => r.teamId);
}

/** Miembros activos del equipo del chat (null = el chat no tiene equipo). */
export async function chatTeamMemberIds(kind: "whatsapp" | "channel", chatId: string): Promise<string[] | null> {
  const row =
    kind === "whatsapp"
      ? await prisma.wAChat.findUnique({ where: { id: chatId }, select: { teamId: true } })
      : await prisma.conversation.findUnique({ where: { id: chatId }, select: { teamId: true } });
  if (!row?.teamId) return null;
  const members = await prisma.teamMember.findMany({
    where: { teamId: row.teamId, user: { disabledAt: null } },
    select: { userId: true },
  });
  return members.map((m) => m.userId);
}

/** Equipo por defecto de la cuenta, para un chat nuevo. */
export async function accountDefaultTeamId(kind: "whatsapp" | "channel", accountId: string): Promise<string | null> {
  const row =
    kind === "whatsapp"
      ? await prisma.wAAccount.findUnique({ where: { id: accountId }, select: { defaultTeamId: true } })
      : await prisma.channelAccount.findUnique({ where: { id: accountId }, select: { defaultTeamId: true } });
  return row?.defaultTeamId ?? null;
}

export const teamBodySchema = z.object({
  name: z.string().max(200),
  memberIds: z.array(z.string().max(64)).max(500).default([]),
  accountIds: z.array(z.string().max(64)).max(200).default([]),
});

export interface TeamInput {
  name: string;
  memberIds: string[];
  /** Cuentas (WhatsApp o canal) cuyos chats nuevos entran a este equipo. */
  accountIds: string[];
}

// Valida que personas y cuentas sean de la organización y las separa por tabla.
async function resolveInput(organizationId: string, input: TeamInput) {
  const name = normalizeTeamName(input.name);
  if (!name) throw new TeamError(400, "Escribe un nombre de hasta 50 caracteres");
  const memberIds = Array.from(new Set(input.memberIds));
  const accountIds = Array.from(new Set(input.accountIds));
  const [users, wa, ch] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: memberIds }, organizationId, disabledAt: null }, select: { id: true } }),
    prisma.wAAccount.findMany({ where: { id: { in: accountIds }, organizationId }, select: { id: true } }),
    prisma.channelAccount.findMany({ where: { id: { in: accountIds }, organizationId }, select: { id: true } }),
  ]);
  if (users.length !== memberIds.length) throw new TeamError(400, "Alguna persona no existe, está desactivada o es de otra organización");
  if (wa.length + ch.length !== accountIds.length) throw new TeamError(400, "Alguna cuenta no existe o es de otra organización");
  return { name, memberIds, waIds: wa.map((a) => a.id), channelIds: ch.map((a) => a.id) };
}

function uniqueNameError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "P2002";
}

export async function createTeam(organizationId: string, input: TeamInput): Promise<string> {
  if ((await prisma.team.count({ where: { organizationId } })) >= TEAMS_PER_ORG_MAX) {
    throw new TeamError(400, `Máximo ${TEAMS_PER_ORG_MAX} equipos por organización`);
  }
  const data = await resolveInput(organizationId, input);
  try {
    return await prisma.$transaction(async (tx) => {
      const team = await tx.team.create({
        data: { organizationId, name: data.name, members: { create: data.memberIds.map((userId) => ({ userId })) } },
        select: { id: true },
      });
      if (data.waIds.length) await tx.wAAccount.updateMany({ where: { id: { in: data.waIds } }, data: { defaultTeamId: team.id } });
      if (data.channelIds.length) await tx.channelAccount.updateMany({ where: { id: { in: data.channelIds } }, data: { defaultTeamId: team.id } });
      return team.id;
    });
  } catch (error) {
    if (uniqueNameError(error)) throw new TeamError(409, "Ya existe un equipo con ese nombre");
    throw error;
  }
}

export async function updateTeam(organizationId: string, teamId: string, input: TeamInput): Promise<void> {
  if (!(await teamBelongsTo(organizationId, teamId))) throw new TeamError(404, "Equipo no encontrado");
  const data = await resolveInput(organizationId, input);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.team.update({ where: { id: teamId }, data: { name: data.name } });
      await tx.teamMember.deleteMany({ where: { teamId, userId: { notIn: data.memberIds } } });
      await tx.teamMember.createMany({ data: data.memberIds.map((userId) => ({ teamId, userId })), skipDuplicates: true });
      // Cuentas: las que se quitaron dejan de tener equipo por defecto; las
      // elegidas pasan a este (aunque antes fueran de otro).
      await tx.wAAccount.updateMany({ where: { organizationId, defaultTeamId: teamId, id: { notIn: data.waIds } }, data: { defaultTeamId: null } });
      await tx.channelAccount.updateMany({ where: { organizationId, defaultTeamId: teamId, id: { notIn: data.channelIds } }, data: { defaultTeamId: null } });
      if (data.waIds.length) await tx.wAAccount.updateMany({ where: { id: { in: data.waIds } }, data: { defaultTeamId: teamId } });
      if (data.channelIds.length) await tx.channelAccount.updateMany({ where: { id: { in: data.channelIds } }, data: { defaultTeamId: teamId } });
    });
  } catch (error) {
    if (uniqueNameError(error)) throw new TeamError(409, "Ya existe un equipo con ese nombre");
    throw error;
  }
}

/** Borra el equipo: sus chats y cuentas quedan sin equipo (onDelete: SetNull). */
export async function deleteTeam(organizationId: string, teamId: string): Promise<void> {
  const { count } = await prisma.team.deleteMany({ where: { id: teamId, organizationId } });
  if (count === 0) throw new TeamError(404, "Equipo no encontrado");
}

/**
 * Filtro `team` de la bandeja: "mine" = los equipos de la persona; un id =
 * ese equipo si es de su organización (si no, ninguno). undefined = sin filtro.
 */
export async function teamFilterIds(param: string | null, userId: string): Promise<string[] | undefined> {
  if (!param) return undefined;
  if (param === "mine") return userTeamIds(userId);
  if (param.length > 64) return [];
  const team = await prisma.team.findFirst({ where: { id: param, organization: { members: { some: { id: userId } } } }, select: { id: true } });
  return team ? [team.id] : [];
}
