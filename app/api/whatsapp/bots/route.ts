import { NextResponse } from "next/server";
import { checkPlanLimit } from "@/lib/billing/gates";
import { checkBotFeature } from "@/lib/bots/feature-gate";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { botSchema } from "@/lib/validations";
import { getUserAccountIds } from "@/lib/shared-accounts";
import { publicErrorMessage } from "@/lib/api-errors";
import { orgWhere, requireOrgId } from "@/lib/tenancy";
import { pickCuratedModel } from "@/lib/ai/platform";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (session.user.role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    const organizationId = await requireOrgId(session.user.id);
    const overAgents = await checkPlanLimit(organizationId, "aiAgents");
    if (overAgents) return overAgents;

    const body = await req.json().catch(() => null);
    const parsed = botSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const {
      name,
      waAccountId,
      channelAccountId,
      systemPrompt,
      temperature,
      maxTokens,
      memoryType,
      memoryLimit,
      ragEnabled,
      humanizeEnabled,
      appointmentSchedulingEnabled,
    } = parsed.data;

    // La plataforma asigna el proveedor/modelo — el cliente nunca elige (puede
    // recibir imágenes por WhatsApp/Telegram, por eso needsVision: true).
    const picked = await pickCuratedModel(true);
    if (!picked) return NextResponse.json({ error: "La IA no está disponible en este momento. Escríbenos si el problema continúa." }, { status: 503 });

    if (waAccountId) {
      // getUserAccountIds (propias + compartidas vía WAAccountShare), no
      // `userId: session.user.id`: con el filtro por dueño, un admin que
      // recibió una cuenta compartida veía el número en el desplegable
      // (GET /accounts sí las devuelve) pero al guardar le respondía
      // "Cuenta no encontrada".
      const allowedAccountIds = await getUserAccountIds(session.user.id);
      if (!allowedAccountIds.includes(waAccountId)) {
        return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
      }
    }

    if (channelAccountId) {
      const channelAccount = await prisma.channelAccount.findFirst({
        where: { id: channelAccountId, ...(await orgWhere(session.user.id)) },
        select: { id: true },
      });
      if (!channelAccount) {
        return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
      }
    }

    // El agente depende de la licencia del dueño del canal, no de quien lo
    // configura (regla 7 de las licencias). Sin canal ("solo pruebas") no hay
    // dueño de canal: cuenta la licencia de quien lo crea.
    const notInLicense = await checkBotFeature(session.user.id, { waAccountId, channelAccountId });
    if (notInLicense) return notInLicense;

    const bot = await prisma.wABot.create({
      data: {
        userId: session.user.id,
        organizationId: await requireOrgId(session.user.id),
        waAccountId: waAccountId ?? null,
        channelAccountId: channelAccountId ?? null,
        name,
        provider: picked.provider,
        model: picked.model,
        systemPrompt,
        temperature: temperature ?? 0.7,
        maxTokens: maxTokens ?? 1024,
        memoryType: memoryType ?? "RECENT",
        memoryLimit: memoryLimit ?? 20,
        ragEnabled: ragEnabled ?? false,
        humanizeEnabled: humanizeEnabled ?? false,
        appointmentSchedulingEnabled: appointmentSchedulingEnabled ?? false,
      },
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
        createdAt: true,
      },
    });

    return NextResponse.json(bot, { status: 201 });
  } catch (error) {
    const message =
      publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (session.user.role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const waAccountId = searchParams.get("waAccountId");

    const where: Record<string, unknown> = { ...(await orgWhere(session.user.id)) };
    if (waAccountId) where.waAccountId = waAccountId;

    const bots = await prisma.wABot.findMany({
      where,
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
        channelAccount: {
          select: { id: true, name: true, channel: true },
        },
        _count: { select: { conversations: true, knowledgeBots: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json(bots);
  } catch (error) {
    const message =
      publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
