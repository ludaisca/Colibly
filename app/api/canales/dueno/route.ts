import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireOrgId } from "@/lib/tenancy";
import { publicErrorMessage } from "@/lib/api-errors";
import { invalidateChannelEntitlement } from "@/lib/billing/entitlements";

// Dueño de un canal (docs/PLAN_LICENCIAS_2026-11-04.md, regla 2): la persona
// cuya licencia ocupa y con cuyo plan funciona. Distinto de quien lo conectó
// (`userId`, que sigue decidiendo quién lo edita). Solo admin. Una persona es
// dueña de a lo más un canal de cada tipo: lo garantizan los índices únicos.

const kindSchema = z.enum(["whatsapp", "channel"]);

async function loadAccount(kind: "whatsapp" | "channel", accountId: string, organizationId: string) {
  if (kind === "whatsapp") {
    const a = await prisma.wAAccount.findFirst({ where: { id: accountId, organizationId }, select: { id: true, name: true, ownerId: true } });
    return a && { ...a, channel: "WHATSAPP" as const };
  }
  return prisma.channelAccount.findFirst({ where: { id: accountId, organizationId }, select: { id: true, name: true, ownerId: true, channel: true } });
}

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "admin") return null;
  return { userId: session.user.id, organizationId: await requireOrgId(session.user.id) };
}

// GET ?kind=whatsapp|channel&accountId=… → dueño actual y personas que pueden serlo.
export async function GET(req: Request) {
  try {
    const ctx = await requireAdmin();
    if (!ctx) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    const url = new URL(req.url);
    const kind = kindSchema.safeParse(url.searchParams.get("kind"));
    const accountId = url.searchParams.get("accountId") ?? "";
    if (!kind.success || !accountId) return NextResponse.json({ error: "Canal inválido" }, { status: 400 });
    const account = await loadAccount(kind.data, accountId, ctx.organizationId);
    if (!account) return NextResponse.json({ error: "Canal no encontrado" }, { status: 404 });

    const users = await prisma.user.findMany({
      where: { organizationId: ctx.organizationId, disabledAt: null },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        license: true,
        ownedWaAccounts: { select: { id: true, name: true } },
        ownedChannelAccounts: { where: { channel: account.channel === "WHATSAPP" ? undefined : account.channel }, select: { id: true, name: true } },
      },
    });
    const candidates = users.map((u) => {
      const owned = account.channel === "WHATSAPP" ? u.ownedWaAccounts : u.ownedChannelAccounts;
      const other = owned.find((o) => o.id !== account.id) ?? null;
      return { id: u.id, name: u.name ?? u.email, email: u.email, license: u.license, ownsOtherOfType: other ? other.name : null };
    });
    return NextResponse.json({ account: { id: account.id, name: account.name, channel: account.channel, ownerId: account.ownerId }, candidates });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno") }, { status: 500 });
  }
}

const patchSchema = z.object({ kind: kindSchema, accountId: z.string().min(1), ownerId: z.string().min(1).nullable() });

// PATCH {kind, accountId, ownerId|null} → cambia el dueño (null = sin dueño: funciona como Básico).
export async function PATCH(req: Request) {
  try {
    const ctx = await requireAdmin();
    if (!ctx) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    const { kind, accountId, ownerId } = parsed.data;
    const account = await loadAccount(kind, accountId, ctx.organizationId);
    if (!account) return NextResponse.json({ error: "Canal no encontrado" }, { status: 404 });
    if (ownerId) {
      const owner = await prisma.user.findFirst({ where: { id: ownerId, organizationId: ctx.organizationId, disabledAt: null }, select: { id: true } });
      if (!owner) return NextResponse.json({ error: "Esa persona no está activa en tu organización" }, { status: 400 });
    }
    try {
      if (kind === "whatsapp") await prisma.wAAccount.update({ where: { id: account.id }, data: { ownerId } });
      else await prisma.channelAccount.update({ where: { id: account.id }, data: { ownerId } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return NextResponse.json(
          { error: "Esa persona ya es dueña de un canal de este tipo. Cada licencia incluye uno de cada tipo: quítale el otro primero." },
          { status: 409 }
        );
      }
      throw error;
    }
    invalidateChannelEntitlement(kind === "whatsapp" ? { waAccountId: account.id } : { channelAccountId: account.id });
    return NextResponse.json({ ok: true, ownerId });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno") }, { status: 500 });
  }
}
