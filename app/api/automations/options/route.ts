import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publicErrorMessage } from "@/lib/api-errors";
import { requireAutomationSession, resolveAccountForUser } from "@/lib/automations/access";
import { getEligibleAssignees, getEligibleChannelAssignees } from "@/lib/chat-assignees";

// Datos que el editor necesita para los selectores de una cuenta: etiquetas,
// campos personalizados, plantillas aprobadas, calificadores, usuarios.
export async function GET(req: Request) {
  try {
    const session = await requireAutomationSession();
    if (session instanceof NextResponse) return session;
    const url = new URL(req.url);
    const account = await resolveAccountForUser(session.user.id, {
      waAccountId: url.searchParams.get("waAccountId"),
      channelAccountId: url.searchParams.get("channelAccountId"),
    });
    if (!account) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    const isWa = "waAccountId" in account;
    const scope = isWa ? { waAccountId: account.waAccountId } : { channelAccountId: account.channelAccountId };

    const ownerId = isWa
      ? (await prisma.wAAccount.findUniqueOrThrow({ where: { id: account.waAccountId }, select: { userId: true } })).userId
      : (await prisma.channelAccount.findUniqueOrThrow({ where: { id: account.channelAccountId }, select: { userId: true } })).userId;

    const [tags, fields, templates, scorers, users, scoreLabels] = await Promise.all([
      prisma.tag.findMany({ where: scope, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      prisma.contactCustomFieldDefinition.findMany({ where: scope, select: { key: true, label: true, type: true, options: true }, orderBy: { order: "asc" } }),
      isWa
        ? prisma.wATemplate.findMany({
            where: { waAccountId: account.waAccountId, status: "APPROVED" },
            select: { id: true, name: true, language: true, components: true },
            orderBy: { name: "asc" },
          })
        : [],
      prisma.wALeadScorerBot.findMany({ where: { userId: ownerId, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      isWa ? getEligibleAssignees(account.waAccountId) : getEligibleChannelAssignees(account.channelAccountId),
      prisma.wALeadScore.findMany({ distinct: ["label"], select: { label: true }, take: 20 }),
    ]);

    return NextResponse.json({
      tags,
      fields,
      templates,
      scorers,
      users: users.map((u) => ({ id: u.id, name: u.name ?? u.email })),
      scoreLabels: [...new Set(["prioridad_alta", "oportunidad", "interesado", "frio", "descartado", ...scoreLabels.map((s) => s.label)])],
    });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}
