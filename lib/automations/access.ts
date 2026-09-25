import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserAccountIds, getUserChannelAccountIds } from "@/lib/shared-accounts";
import { forbidRoles } from "@/lib/roles";
import type { AutomationChannel } from "./validate";

// Acceso a automatizaciones desde la UI: admin y user (el ejecutivo no tiene
// la sección, igual que Secuencias), acotado a las cuentas propias y
// compartidas — nunca por creador.

export async function requireAutomationSession(): Promise<Session | NextResponse> {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const denied = forbidRoles(session, ["ejecutivo"]);
  if (denied) return denied;
  return session;
}

export async function automationScopeWhere(userId: string) {
  const [accountIds, channelAccountIds] = await Promise.all([getUserAccountIds(userId), getUserChannelAccountIds(userId)]);
  return { OR: [{ waAccountId: { in: accountIds } }, { channelAccountId: { in: channelAccountIds } }] };
}

export async function findAccessibleAutomation(userId: string, id: string) {
  return prisma.automation.findFirst({
    where: { id, ...(await automationScopeWhere(userId)) },
    include: {
      waAccount: { select: { id: true, name: true, userId: true } },
      channelAccount: { select: { id: true, name: true, channel: true, userId: true } },
      publishedVersion: { select: { id: true, version: true, publishedAt: true } },
    },
  });
}

export type AccessibleAutomation = NonNullable<Awaited<ReturnType<typeof findAccessibleAutomation>>>;

export function automationChannel(a: { waAccountId: string | null; channelAccount: { channel: string } | null }): AutomationChannel {
  return a.waAccountId ? "WHATSAPP" : ((a.channelAccount?.channel ?? "TELEGRAM") as AutomationChannel);
}

// Valida que el usuario tenga acceso a la cuenta elegida al crear.
export async function resolveAccountForUser(
  userId: string,
  input: { waAccountId?: string | null; channelAccountId?: string | null }
): Promise<{ waAccountId: string } | { channelAccountId: string } | null> {
  if (input.waAccountId) {
    return (await getUserAccountIds(userId)).includes(input.waAccountId) ? { waAccountId: input.waAccountId } : null;
  }
  if (input.channelAccountId) {
    return (await getUserChannelAccountIds(userId)).includes(input.channelAccountId) ? { channelAccountId: input.channelAccountId } : null;
  }
  return null;
}
