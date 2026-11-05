import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserAccountIds, getUserChannelAccountIds } from "@/lib/shared-accounts";
import { checkUserFeature } from "@/lib/billing/entitlements";
import { publicErrorMessage } from "@/lib/api-errors";
import { suggestTaskTitle, WritingAssistError } from "@/lib/ai/writing-assist";
import { recordContactActivity } from "@/lib/contacts/activity";

async function ownedContact(userId: string, id: string) {
  const [accountIds, channelAccountIds] = await Promise.all([
    getUserAccountIds(userId),
    getUserChannelAccountIds(userId),
  ]);
  return prisma.contact.findFirst({
    where: { id, OR: [{ accountId: { in: accountIds } }, { channelAccountId: { in: channelAccountIds } }] },
    select: {
      id: true,
      account: { select: { organizationId: true } },
      channelAccount: { select: { organizationId: true } },
      chat: { select: { id: true } },
      conversation: { select: { id: true } },
    },
  });
}

const createSchema = z.object({
  title: z.string().trim().min(1, "La tarea necesita un título").max(200, "Máximo 200 caracteres"),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { id } = await params;
    const contact = await ownedContact(session.user.id, id);
    if (!contact) return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });
    const tasks = await prisma.contactTask.findMany({
      where: { contactId: id },
      orderBy: [{ done: "asc" }, { createdAt: "desc" }],
      select: { id: true, title: true, done: true, createdAt: true },
    });
    return NextResponse.json(tasks);
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { id } = await params;
    const contact = await ownedContact(session.user.id, id);
    if (!contact) return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });
    const organizationId = contact.account?.organizationId ?? contact.channelAccount?.organizationId;
    if (!organizationId) return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });

    const body = await req.json().catch(() => null);
    const suggest = body && typeof body === "object" && body.suggest === true;
    let title: string;
    if (suggest) {
      const noAi = await checkUserFeature(session.user.id, "aiAssist");
      if (noAi) return noAi;
      const lines = contact.chat
        ? await prisma.wAMessage.findMany({ where: { chatId: contact.chat.id }, orderBy: { timestamp: "desc" }, take: 20, select: { direction: true, body: true } })
        : contact.conversation
          ? await prisma.channelMessage.findMany({ where: { conversationId: contact.conversation.id }, orderBy: { timestamp: "desc" }, take: 20, select: { direction: true, body: true } })
          : [];
      const transcript = lines.reverse().map((line) => `${line.direction === "INBOUND" ? "Cliente" : "Equipo"}: ${line.body ?? ""}`).join("\n");
      if (!transcript.trim()) return NextResponse.json({ error: "No hay conversación para proponer una tarea" }, { status: 400 });
      try {
        title = (await suggestTaskTitle(organizationId, transcript, session.user.id)).slice(0, 200);
      } catch (err) {
        if (err instanceof WritingAssistError) return NextResponse.json({ error: err.message }, { status: 400 });
        throw err;
      }
    } else {
      const parsed = createSchema.safeParse(body);
      if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
      title = parsed.data.title;
    }

    const task = await prisma.contactTask.create({
      data: { organizationId, contactId: id, title, createdById: session.user.id },
      select: { id: true, title: true, done: true, createdAt: true },
    });
    await recordContactActivity({
      contactId: id,
      type: "TASK_CREATED",
      title: `Tarea: ${task.title}`,
      actorId: session.user.id,
      dedupeKey: `task:${task.id}:created`,
    });

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}
