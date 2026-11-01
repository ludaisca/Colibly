import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserAccountIds, getUserChannelAccountIds } from "@/lib/shared-accounts";
import { forbidRoles } from "@/lib/roles";
import { chatCustomFieldDefinitionSchema } from "@/lib/validations";
import { publicErrorMessage } from "@/lib/api-errors";

async function resolveAccount(userId: string, waAccountId: string | null, channelAccountId: string | null) {
  const [waIds, channelIds] = await Promise.all([getUserAccountIds(userId), getUserChannelAccountIds(userId)]);
  if (waAccountId) {
    if (!waIds.includes(waAccountId)) return null;
    return { waAccountId, channelAccountId: null as null };
  }
  if (channelAccountId) {
    if (!channelIds.includes(channelAccountId)) return null;
    return { waAccountId: null as null, channelAccountId };
  }
  return undefined;
}

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const account = await resolveAccount(session.user.id, searchParams.get("waAccountId"), searchParams.get("channelAccountId"));
    if (account === null) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    if (account === undefined) return NextResponse.json({ error: "Falta la cuenta" }, { status: 400 });

    const definitions = await prisma.chatCustomFieldDefinition.findMany({
      where: account.waAccountId ? { waAccountId: account.waAccountId } : { channelAccountId: account.channelAccountId },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json(definitions);
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const denied = forbidRoles(session, ["ejecutivo"]);
    if (denied) return denied;

    const parsed = chatCustomFieldDefinitionSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

    const account = await resolveAccount(session.user.id, parsed.data.waAccountId ?? null, parsed.data.channelAccountId ?? null);
    if (account === null) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    if (account === undefined) return NextResponse.json({ error: "Falta la cuenta" }, { status: 400 });

    const maxOrder = await prisma.chatCustomFieldDefinition.aggregate({
      where: account.waAccountId ? { waAccountId: account.waAccountId } : { channelAccountId: account.channelAccountId },
      _max: { order: true },
    });
    const definition = await prisma.chatCustomFieldDefinition.create({
      data: {
        ...(account.waAccountId ? { waAccountId: account.waAccountId } : { channelAccountId: account.channelAccountId }),
        key: parsed.data.key,
        label: parsed.data.label,
        type: parsed.data.type,
        options: parsed.data.options ?? [],
        required: parsed.data.required ?? false,
        order: parsed.data.order ?? (maxOrder._max.order ?? -1) + 1,
      },
    });
    return NextResponse.json(definition, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}
