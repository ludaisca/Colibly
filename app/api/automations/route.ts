import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { publicErrorMessage } from "@/lib/api-errors";
import { automationScopeWhere, requireAutomationSession, resolveAccountForUser } from "@/lib/automations/access";
import { AUTOMATION_TEMPLATES } from "@/lib/automations/templates";
import { defaultSettings } from "@/lib/automations/settings";
import type { Graph } from "@/lib/automations/types";
import { requireOrgId } from "@/lib/tenancy";
import { checkUserFeature } from "@/lib/billing/entitlements";

// Lista de automatizaciones de todas las cuentas del usuario (propias +
// compartidas), con conteo de ejecuciones por estado.
export async function GET() {
  try {
    const session = await requireAutomationSession();
    if (session instanceof NextResponse) return session;

    const automations = await prisma.automation.findMany({
      where: await automationScopeWhere(session.user.id),
      orderBy: { updatedAt: "desc" },
      include: {
        waAccount: { select: { id: true, name: true } },
        channelAccount: { select: { id: true, name: true, channel: true } },
        publishedVersion: { select: { version: true, publishedAt: true } },
      },
    });
    const counts = await prisma.automationRun.groupBy({
      by: ["automationId", "status"],
      where: { automationId: { in: automations.map((a) => a.id) } },
      _count: { _all: true },
    });
    const countFor = (id: string, statuses: string[]) =>
      counts.filter((c) => c.automationId === id && statuses.includes(c.status)).reduce((n, c) => n + c._count._all, 0);

    return NextResponse.json(
      automations.map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        status: a.status,
        trigger: (a.draftGraph as unknown as Graph).trigger,
        account: a.waAccount
          ? { id: a.waAccount.id, name: a.waAccount.name, channel: "WHATSAPP" }
          : { id: a.channelAccount!.id, name: a.channelAccount!.name, channel: a.channelAccount!.channel },
        publishedVersion: a.publishedVersion,
        conversational: a.conversational,
        runs: {
          live: countFor(a.id, ["ACTIVE", "WAITING_DELAY", "WAITING_REPLY", "PAUSED_BY_AGENT"]),
          completed: countFor(a.id, ["COMPLETED", "HANDED_OFF", "HANDED_TO_BOT", "EXITED_REPLY"]),
          problems: countFor(a.id, ["FAILED", "EXPIRED"]),
        },
        updatedAt: a.updatedAt,
      }))
    );
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}

const createSchema = z
  .object({
    name: z.string().trim().min(1, "El nombre es requerido").max(120),
    templateId: z.string().default("blank"),
    waAccountId: z.string().nullish(),
    channelAccountId: z.string().nullish(),
  })
  .refine((d) => !!d.waAccountId !== !!d.channelAccountId, "Elige una cuenta");

// Crea un borrador desde una plantilla de la galería. Nace en DRAFT: no corre
// hasta publicar.
export async function POST(req: Request) {
  try {
    const session = await requireAutomationSession();
    if (session instanceof NextResponse) return session;
    const notInLicense = await checkUserFeature(session.user.id, "automations");
    if (notInLicense) return notInLicense;

    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    const account = await resolveAccountForUser(session.user.id, parsed.data);
    if (!account) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });

    const template = AUTOMATION_TEMPLATES.find((t) => t.id === parsed.data.templateId) ?? AUTOMATION_TEMPLATES[0];
    const graph = template.build();
    const automation = await prisma.automation.create({
      data: {
        ...account,
        organizationId: await requireOrgId(session.user.id),
        name: parsed.data.name,
        description: template.id === "blank" ? null : template.description,
        draftGraph: graph as unknown as Prisma.InputJsonValue,
        settings: defaultSettings(graph.trigger.type) as unknown as Prisma.InputJsonValue,
        createdById: session.user.id,
      },
      select: { id: true },
    });
    return NextResponse.json(automation, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}
