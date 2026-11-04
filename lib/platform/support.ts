import { prisma } from "@/lib/prisma";
import { invalidateUserSessionCache } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { disableTwoFactor } from "@/lib/two-factor";
import { isPlatformAdminEmail } from "@/lib/platform-admin";
import { effectiveAvailability } from "@/lib/users/availability-rules";
import { httpTimeout } from "@/lib/http-timeouts";
import { logPlatformAction } from "./audit";
import type { OpsResult, PlatformActor } from "./ops";
import { noticesFrom, whatsappVerdict, type MetaHealthEntity, type WhatsAppVerdict } from "./whatsapp-health-rules";
import { GRAPH_API_BASE } from "@/lib/meta/graph";

// Soporte del operador: buscar a un usuario, sacarlo de un bloqueo de 2FA y
// ver la salud de los números de WhatsApp contra Meta. Compartido por la API
// de sesión (/plataforma), la API de tokens y el MCP. Nada de esto devuelve
// secretos: del usuario solo se leen campos con `select`.

function fail(status: number, code: string, message: string): OpsResult<never> {
  return { ok: false, status, code, message };
}

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  createdAt: true,
  emailVerifiedAt: true,
  disabledAt: true,
  twoFactorEnabledAt: true,
  twoFactorBackupCodes: true,
  availability: true,
  lastSeenAt: true,
  organization: { select: { id: true, name: true, status: true, ownerId: true } },
} as const;

type UserRow = NonNullable<Awaited<ReturnType<typeof findUserRow>>>;

function findUserRow(where: { id: string } | { email: string }) {
  return prisma.user.findUnique({ where, select: USER_SELECT });
}

function presentUser(user: UserRow, now = Date.now()) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isOwner: user.organization.ownerId === user.id,
    isPlatformAdmin: isPlatformAdminEmail(user.email),
    createdAt: user.createdAt,
    emailVerified: !!user.emailVerifiedAt,
    // Explica por qué alguien no puede entrar sin que el operador adivine.
    canSignIn: !user.disabledAt && (!!user.emailVerifiedAt || isPlatformAdminEmail(user.email)) && user.organization.status !== "SUSPENDED",
    disabledAt: user.disabledAt,
    twoFactor: {
      enabled: !!user.twoFactorEnabledAt,
      enabledAt: user.twoFactorEnabledAt,
      backupCodesLeft: user.twoFactorEnabledAt ? user.twoFactorBackupCodes.length : 0,
    },
    availability: effectiveAvailability({ availability: user.availability, lastSeenAt: user.lastSeenAt }, now),
    lastSeenAt: user.lastSeenAt,
    organization: { id: user.organization.id, name: user.organization.name, status: user.organization.status },
  };
}

export type PlatformUserView = ReturnType<typeof presentUser>;

/** Busca por correo exacto (sin distinguir mayúsculas) o, si no hay, por coincidencia parcial (máx. 20). */
export async function findUsers(query: string): Promise<OpsResult<{ items: PlatformUserView[] }>> {
  const q = query.trim().toLowerCase();
  if (q.length < 3) return fail(400, "invalid_request", "Escribe al menos 3 caracteres del correo");
  const exact = await findUserRow({ email: q });
  if (exact) return { ok: true, data: { items: [presentUser(exact)] } };
  const rows = await prisma.user.findMany({
    where: { email: { contains: q, mode: "insensitive" } },
    select: USER_SELECT,
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return { ok: true, data: { items: rows.map((row) => presentUser(row)) } };
}

/**
 * Quita la 2FA a un usuario que perdió su teléfono y sus códigos de respaldo,
 * y cierra todas sus sesiones (sube sessionVersion). Nunca a un operador de la
 * plataforma: un token filtrado no debe poder desarmar la 2FA de quien opera.
 */
export async function resetUserTwoFactor(input: { userId: string; reason: string; actor: PlatformActor }): Promise<OpsResult<PlatformUserView>> {
  const reason = input.reason.trim();
  if (reason.length < 5) return fail(400, "invalid_request", "Escribe el motivo (mínimo 5 caracteres): queda en la auditoría");
  const user = await findUserRow({ id: input.userId });
  if (!user) return fail(404, "not_found", "Usuario no encontrado");
  if (isPlatformAdminEmail(user.email)) {
    return fail(403, "forbidden", "La verificación en dos pasos de un operador de la plataforma no se quita por aquí");
  }
  if (!user.twoFactorEnabledAt) return fail(400, "invalid_request", "Ese usuario no tiene la verificación en dos pasos activa");

  await disableTwoFactor(user.id);
  await prisma.user.update({ where: { id: user.id }, data: { sessionVersion: { increment: 1 } } });
  invalidateUserSessionCache(user.id);
  await logPlatformAction({
    actor: { type: input.actor.type, email: input.actor.email, tokenId: input.actor.tokenId },
    action: "user.reset_two_factor",
    target: { type: "user", id: user.id },
    before: { twoFactorEnabled: true, organizationId: user.organization.id },
    after: { twoFactorEnabled: false, sessionsClosed: true, reason },
  });
  const updated = await findUserRow({ id: user.id });
  return { ok: true, data: presentUser(updated!) };
}

// ── Salud de WhatsApp ────────────────────────────────────────────────────────

const META_FIELDS = "verified_name,name_status,status,quality_rating,messaging_limit_tier,display_phone_number,health_status";
const META_TIMEOUT_MS = 8_000;
const MAX_ACCOUNTS = 25;
const CONCURRENCY = 5;


interface MetaPhoneInfo {
  verified_name?: string;
  name_status?: string;
  status?: string;
  quality_rating?: string;
  messaging_limit_tier?: string;
  display_phone_number?: string;
  health_status?: { can_send_message?: string; entities?: MetaHealthEntity[] };
  error?: { message?: string; code?: number };
}

export interface WhatsAppAccountHealth {
  accountId: string;
  name: string;
  organization: { id: string; name: string };
  connectionType: string;
  localStatus: string;
  lastActivity: Date | null;
  failedLast24h: number;
  meta:
    | {
        reachable: true;
        phone: string | null;
        verifiedName: string | null;
        nameStatus: string | null;
        numberStatus: string | null;
        quality: string | null;
        messagingLimit: string | null;
        canSendMessage: string | null;
        // Avisos de Meta por entidad (número, WABA, negocio, app). Los errores de
        // SIP (llamadas) se omiten: no afectan el envío de mensajes.
        notices: string[];
      }
    | { reachable: false; error: string };
  verdict: WhatsAppVerdict;
}

async function fetchMetaPhone(phoneNumberId: string, token: string): Promise<MetaPhoneInfo> {
  const res = await fetch(`${GRAPH_API_BASE}/${phoneNumberId}?fields=${META_FIELDS}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: httpTimeout(META_TIMEOUT_MS),
  });
  const body = (await res.json().catch(() => null)) as MetaPhoneInfo | null;
  if (!res.ok || !body) throw new Error(body?.error?.message ?? `Graph respondió ${res.status}`);
  return body;
}

async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        out[index] = await fn(items[index]);
      }
    })
  );
  return out;
}

/**
 * Consulta a Meta el estado de los números de WhatsApp (nombre para mostrar,
 * límite de envío, calidad, avisos). Filtra por organización o por cuenta; sin
 * filtro revisa las cuentas con actividad más reciente. Máximo 25 por llamada.
 */
export async function getWhatsAppHealth(input: { organizationId?: string; accountId?: string; page?: number }): Promise<OpsResult<{ items: WhatsAppAccountHealth[]; total: number; page: number; pageSize: number }>> {
  const page = Math.max(1, input.page ?? 1);
  const where = {
    ...(input.organizationId ? { organizationId: input.organizationId } : {}),
    ...(input.accountId ? { id: input.accountId } : {}),
  };
  const [total, accounts] = await Promise.all([
    prisma.wAAccount.count({ where }),
    prisma.wAAccount.findMany({
      where,
      orderBy: [{ lastActivity: { sort: "desc", nulls: "last" } }, { name: "asc" }],
      skip: (page - 1) * MAX_ACCOUNTS,
      take: MAX_ACCOUNTS,
      select: {
        id: true,
        name: true,
        status: true,
        connectionType: true,
        lastActivity: true,
        phoneNumberId: true,
        accessToken: true,
        organization: { select: { id: true, name: true } },
      },
    }),
  ]);
  if (total === 0 && (input.organizationId || input.accountId)) {
    return fail(404, "not_found", input.accountId ? "Cuenta de WhatsApp no encontrada" : "Esa organización no tiene cuentas de WhatsApp");
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const failedRows = accounts.length
    ? await prisma.wAMessage.groupBy({
        by: ["chatId"],
        where: { direction: "OUTBOUND", status: "failed", timestamp: { gte: since }, chat: { accountId: { in: accounts.map((a) => a.id) } } },
        _count: true,
      })
    : [];
  const chatAccounts = failedRows.length
    ? await prisma.wAChat.findMany({ where: { id: { in: failedRows.map((r) => r.chatId) } }, select: { id: true, accountId: true } })
    : [];
  const accountOfChat = new Map(chatAccounts.map((c) => [c.id, c.accountId]));
  const failedByAccount = new Map<string, number>();
  for (const row of failedRows) {
    const accountId = accountOfChat.get(row.chatId);
    if (accountId) failedByAccount.set(accountId, (failedByAccount.get(accountId) ?? 0) + row._count);
  }

  const items = await mapLimited(accounts, CONCURRENCY, async (account): Promise<WhatsAppAccountHealth> => {
    const base = {
      accountId: account.id,
      name: account.name,
      organization: account.organization,
      connectionType: account.connectionType,
      localStatus: account.status,
      lastActivity: account.lastActivity,
      failedLast24h: failedByAccount.get(account.id) ?? 0,
    };
    if (!account.phoneNumberId || !account.accessToken) {
      return { ...base, meta: { reachable: false, error: "La cuenta no tiene número o token de Meta" }, verdict: "unknown" };
    }
    try {
      const info = await fetchMetaPhone(account.phoneNumberId, decrypt(account.accessToken));
      const meta = {
        reachable: true as const,
        phone: info.display_phone_number ?? null,
        verifiedName: info.verified_name ?? null,
        nameStatus: info.name_status ?? null,
        numberStatus: info.status ?? null,
        quality: info.quality_rating ?? null,
        messagingLimit: info.messaging_limit_tier ?? null,
        canSendMessage: info.health_status?.can_send_message ?? null,
        notices: noticesFrom(info.health_status?.entities),
      };
      return { ...base, meta, verdict: whatsappVerdict(meta) };
    } catch (error) {
      return { ...base, meta: { reachable: false, error: error instanceof Error ? error.message : String(error) }, verdict: "unknown" };
    }
  });

  return { ok: true, data: { items, total, page, pageSize: MAX_ACCOUNTS } };
}
