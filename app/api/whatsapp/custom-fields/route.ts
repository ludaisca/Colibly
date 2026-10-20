import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserAccountIds, getUserChannelAccountIds } from "@/lib/shared-accounts";
import { contactCustomFieldDefinitionSchema } from "@/lib/validations";
import { publicErrorMessage } from "@/lib/api-errors";

// CRUD de definiciones — mismo shape que /api/whatsapp/canned-responses
// (dual waAccountId/channelAccountId, ?waAccountId=/?channelAccountId= para
// listar una cuenta puntual, sin filtro = todas las del usuario).
export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const waAccountId = searchParams.get("waAccountId");
    const channelAccountId = searchParams.get("channelAccountId");

    if (waAccountId) {
      const accountIds = await getUserAccountIds(session.user.id);
      if (!accountIds.includes(waAccountId)) {
        return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
      }
      const definitions = await prisma.contactCustomFieldDefinition.findMany({
        where: { waAccountId },
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      });
      return NextResponse.json(definitions);
    }

    if (channelAccountId) {
      const channelAccountIds = await getUserChannelAccountIds(session.user.id);
      if (!channelAccountIds.includes(channelAccountId)) {
        return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
      }
      const definitions = await prisma.contactCustomFieldDefinition.findMany({
        where: { channelAccountId },
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      });
      return NextResponse.json(definitions);
    }

    const [accountIds, channelAccountIds] = await Promise.all([
      getUserAccountIds(session.user.id),
      getUserChannelAccountIds(session.user.id),
    ]);

    const definitions = await prisma.contactCustomFieldDefinition.findMany({
      where: {
        OR: [
          { waAccountId: { in: accountIds } },
          { channelAccountId: { in: channelAccountIds } },
        ],
      },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    });

    return NextResponse.json(definitions);
  } catch (error) {
    const message = publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const parsed = contactCustomFieldDefinitionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    if (parsed.data.waAccountId) {
      const accountIds = await getUserAccountIds(session.user.id);
      if (!accountIds.includes(parsed.data.waAccountId)) {
        return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
      }
    } else {
      const channelAccountIds = await getUserChannelAccountIds(session.user.id);
      if (!channelAccountIds.includes(parsed.data.channelAccountId!)) {
        return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
      }
    }

    const definition = await prisma.contactCustomFieldDefinition.create({
      data: {
        waAccountId: parsed.data.waAccountId ?? null,
        channelAccountId: parsed.data.channelAccountId ?? null,
        key: parsed.data.key,
        label: parsed.data.label,
        type: parsed.data.type,
        options: parsed.data.type === "SELECT" ? (parsed.data.options ?? []) : [],
        required: parsed.data.required ?? false,
      },
    });

    return NextResponse.json(definition, { status: 201 });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      return NextResponse.json({ error: "Ya existe un campo con esa clave en esta cuenta" }, { status: 409 });
    }
    const message = publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
