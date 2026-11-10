import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { tagSchema } from "@/lib/validations";
import { getUserAccountIds, getUserChannelAccountIds } from "@/lib/shared-accounts";
import { resolveTagScope } from "@/lib/tags";
import { publicErrorMessage } from "@/lib/api-errors";

const TAG_SELECT = { id: true, name: true, color: true, waAccountId: true, channelAccountId: true, organizationId: true } as const;

// Etiquetas por cuenta. Con ?waAccountId= / ?channelAccountId= / ?contactId= /
// ?chatId= devuelve el catálogo de ESA cuenta (lo que usan los selectores); sin
// parámetros, las de todas las cuentas a las que el usuario tiene acceso.
export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const scopeInput = {
      waAccountId: searchParams.get("waAccountId"),
      channelAccountId: searchParams.get("channelAccountId"),
      contactId: searchParams.get("contactId"),
      chatId: searchParams.get("chatId"),
      organization: searchParams.get("organization") === "1",
    };

    if (Object.values(scopeInput).some(Boolean)) {
      const scope = await resolveTagScope(session.user.id, scopeInput);
      if (!scope) {
        return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
      }
      const tags = await prisma.tag.findMany({ where: scope, orderBy: { name: "asc" }, select: TAG_SELECT });
      return NextResponse.json(tags);
    }

    const [accountIds, channelAccountIds] = await Promise.all([
      getUserAccountIds(session.user.id),
      getUserChannelAccountIds(session.user.id),
    ]);
    const orgTagScope = await resolveTagScope(session.user.id, { organization: true });
    const tags = await prisma.tag.findMany({
      where: { OR: [{ waAccountId: { in: accountIds } }, { channelAccountId: { in: channelAccountIds } }, ...(orgTagScope ? [orgTagScope] : [])] },
      orderBy: { name: "asc" },
      select: TAG_SELECT,
    });
    return NextResponse.json(tags);
  } catch (error) {
    const message =
      publicErrorMessage(error, "Error interno del servidor");
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
    const parsed = tagSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { name, color, ...scopeInput } = parsed.data;
    const scope = await resolveTagScope(session.user.id, scopeInput);
    if (!scope) {
      return NextResponse.json({ error: "Indica una cuenta, contacto o chat válido para la etiqueta" }, { status: 400 });
    }

    const tag = await prisma.tag.create({
      data: {
        ...scope,
        name,
        ...(color ? { color } : {}),
      },
      select: TAG_SELECT,
    });

    return NextResponse.json(tag, { status: 201 });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      return NextResponse.json({ error: "Ya existe una etiqueta con ese nombre en esta cuenta" }, { status: 409 });
    }
    const message =
      publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
