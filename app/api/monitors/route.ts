import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publicErrorMessage } from "@/lib/api-errors";
import { BILLING_PLAN_PATH, hasLeadScoringAccess } from "@/lib/billing/gates";
import { MAX_MONITORS_PER_ORG } from "@/lib/monitors/rules";
import { PLAN_MESSAGE, monitorSchema, monitorSession } from "./_shared";

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
      hasLeadScoringAccess(ctx.organizationId),
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
    if (!(await hasLeadScoringAccess(ctx.organizationId))) {
      return NextResponse.json({ error: PLAN_MESSAGE, code: "plan_limit", limit: "leadScoring", actionUrl: BILLING_PLAN_PATH }, { status: 402 });
    }
    const parsed = monitorSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    const count = await prisma.topicMonitor.count({ where: { organizationId: ctx.organizationId } });
    if (count >= MAX_MONITORS_PER_ORG) {
      return NextResponse.json({ error: `Máximo ${MAX_MONITORS_PER_ORG} monitores por organización` }, { status: 400 });
    }
    const monitor = await prisma.topicMonitor.create({
      data: { organizationId: ctx.organizationId, createdById: ctx.userId, name: parsed.data.name, description: parsed.data.description, active: parsed.data.active ?? true },
      select: { id: true, name: true, description: true, active: true, createdAt: true },
    });
    return NextResponse.json({ ...monitor, matchCount: 0 }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno") }, { status: 500 });
  }
}
