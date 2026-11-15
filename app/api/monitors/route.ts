import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publicErrorMessage } from "@/lib/api-errors";
import { checkUserFeature, userHasFeature } from "@/lib/billing/entitlements";
import { MAX_MONITORS_PER_ORG } from "@/lib/monitors/rules";
import { monitorSchema, monitorSession } from "./_shared";

export async function GET() {
  try {
    const ctx = await monitorSession();
    if (ctx instanceof NextResponse) return ctx;
    const [monitors, planIncluded] = await Promise.all([
      prisma.topicMonitor.findMany({
        where: { organizationId: ctx.organizationId },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, description: true, active: true, createdAt: true, _count: { select: { matches: true } } },
      }),
      userHasFeature(ctx.userId, "topicMonitors"),
    ]);
    return NextResponse.json({
      planIncluded,
      max: MAX_MONITORS_PER_ORG,
      monitors: monitors.map(({ _count, ...monitor }) => ({ ...monitor, matchCount: _count.matches })),
    });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno") }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await monitorSession();
    if (ctx instanceof NextResponse) return ctx;
    // El monitor corre con la licencia y los créditos de quien lo crea (regla 6).
    const notInLicense = await checkUserFeature(ctx.userId, "topicMonitors");
    if (notInLicense) return notInLicense;
    const parsed = monitorSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    const count = await prisma.topicMonitor.count({ where: { organizationId: ctx.organizationId } });
    if (count >= MAX_MONITORS_PER_ORG) {
      return NextResponse.json({ error: `Máximo ${MAX_MONITORS_PER_ORG} monitores por organización` }, { status: 400 });
    }
    const monitor = await prisma.topicMonitor.create({
      // QA-032: un monitor nuevo nace inactivo salvo que se pida encendido.
      data: { organizationId: ctx.organizationId, createdById: ctx.userId, name: parsed.data.name, description: parsed.data.description, active: parsed.data.active ?? false },
      select: { id: true, name: true, description: true, active: true, createdAt: true },
    });
    return NextResponse.json({ ...monitor, matchCount: 0 }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno") }, { status: 500 });
  }
}
