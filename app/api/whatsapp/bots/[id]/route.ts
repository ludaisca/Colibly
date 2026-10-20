import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { botUpdateSchema } from "@/lib/validations";
import { getUserAccountIds } from "@/lib/shared-accounts";
import { findOtherActiveBot } from "@/lib/bots/guards";
import { publicErrorMessage } from "@/lib/api-errors";
import { orgWhere } from "@/lib/tenancy";
import { modelChoiceError, pickCuratedModel } from "@/lib/ai/platform";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (session.user.role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { id } = await params;

    const bot = await prisma.wABot.findFirst({
      where: { id, ...(await orgWhere(session.user.id)) },
      select: {
        id: true,
        name: true,
        systemPrompt: true,
        temperature: true,
        maxTokens: true,
        memoryType: true,
        memoryLimit: true,
        ragEnabled: true,
        humanizeEnabled: true,
        appointmentSchedulingEnabled: true,
        isActive: true,
        status: true,
        waAccountId: true,
        channelAccountId: true,
        createdAt: true,
        updatedAt: true,
        waAccount: {
          select: { id: true, name: true, phoneNumber: true },
        },
        channelAccount: { select: { id: true, name: true, channel: true } },
        _count: { select: { conversations: true, knowledgeBots: true } },
      },
    });

    if (!bot) {
      return NextResponse.json({ error: "Bot no encontrado" }, { status: 404 });
    }

    return NextResponse.json(bot);
  } catch (error) {
    const message =
      publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (session.user.role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { id } = await params;

    const existing = await prisma.wABot.findFirst({
      where: { id, ...(await orgWhere(session.user.id)) },
    });

    if (!existing) {
      return NextResponse.json({ error: "Bot no encontrado" }, { status: 404 });
    }

    const body = await req.json().catch(() => null);
    const parsed = botUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const data: Record<string, unknown> = {};
    const fields = parsed.data;

    // El cliente nunca envía provider/model — si el que ya tiene guardado dejó
    // de ser válido (el operador apagó ese proveedor en /plataforma), se
    // reasigna sola en silencio en vez de bloquear la edición con un error que
    // el cliente no podría resolver.
    if (await modelChoiceError(existing.provider, existing.model)) {
      const picked = await pickCuratedModel(true);
      if (picked) {
        data.provider = picked.provider;
        data.model = picked.model;
      }
    }

    if (fields.name) data.name = fields.name;
    if (fields.waAccountId !== undefined) {
      if (fields.waAccountId) {
        // Propias + compartidas (ver comentario equivalente en bots/route.ts).
        const allowedAccountIds = await getUserAccountIds(session.user.id);
        if (!allowedAccountIds.includes(fields.waAccountId)) {
          return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
        }
      }
      data.waAccountId = fields.waAccountId || null;
      // Asignar un canal limpia el otro — son mutuamente excluyentes, y sin
      // esto un bot que pasa de Telegram a WhatsApp conservaría ambos FKs.
      if (fields.waAccountId) data.channelAccountId = null;
    }
    if (fields.channelAccountId !== undefined) {
      if (fields.channelAccountId) {
        const channelAccount = await prisma.channelAccount.findFirst({
          where: { id: fields.channelAccountId, ...(await orgWhere(session.user.id)) },
          select: { id: true },
        });
        if (!channelAccount) {
          return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
        }
      }
      data.channelAccountId = fields.channelAccountId || null;
      if (fields.channelAccountId) data.waAccountId = null;
    }
    // Mover un bot ACTIVO a una cuenta que ya tiene otro bot activo dejaría dos
    // respondiendo al mismo mensaje — mismo criterio que el toggle.
    if (existing.isActive && (fields.waAccountId || fields.channelAccountId)) {
      const other = await findOtherActiveBot(existing.id, {
        waAccountId: fields.waAccountId || null,
        channelAccountId: fields.waAccountId ? null : fields.channelAccountId || null,
      });
      if (other) {
        return NextResponse.json(
          { error: `Esa cuenta ya tiene un bot activo ("${other.name}"). Desactiva uno de los dos primero.` },
          { status: 409 }
        );
      }
    }
    if (fields.systemPrompt) data.systemPrompt = fields.systemPrompt;
    if (fields.temperature !== undefined) data.temperature = fields.temperature;
    if (fields.maxTokens !== undefined) data.maxTokens = fields.maxTokens;
    if (fields.memoryType) data.memoryType = fields.memoryType;
    if (fields.memoryLimit !== undefined) data.memoryLimit = fields.memoryLimit;
    if (fields.ragEnabled !== undefined) data.ragEnabled = fields.ragEnabled;
    if (fields.humanizeEnabled !== undefined) data.humanizeEnabled = fields.humanizeEnabled;
    if (fields.appointmentSchedulingEnabled !== undefined) data.appointmentSchedulingEnabled = fields.appointmentSchedulingEnabled;

    const updated = await prisma.wABot.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        systemPrompt: true,
        temperature: true,
        maxTokens: true,
        memoryType: true,
        memoryLimit: true,
        ragEnabled: true,
        humanizeEnabled: true,
        appointmentSchedulingEnabled: true,
        isActive: true,
        status: true,
        waAccountId: true,
        channelAccountId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    const message =
      publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (session.user.role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { id } = await params;

    const existing = await prisma.wABot.findFirst({
      where: { id, ...(await orgWhere(session.user.id)) },
    });

    if (!existing) {
      return NextResponse.json({ error: "Bot no encontrado" }, { status: 404 });
    }

    await prisma.wABot.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message =
      publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
