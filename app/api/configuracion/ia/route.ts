import { NextResponse } from "next/server";
import type { OrganizationStatus, PlanId } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { orgAiSettingsUpdateSchema } from "@/lib/validations";
import { publicErrorMessage } from "@/lib/api-errors";
import { requireOrgId } from "@/lib/tenancy";
import { orgAiCreditSummary } from "@/lib/ai/credits";

// IA y operación de la organización (solo admin). La IA la provee la
// plataforma: aquí se ven los créditos del plan y los modelos disponibles, y se
// editan el horario del negocio, la recuperación de leads y el auto-resolver.

const SELECT = {
  plan: true,
  isInternal: true,
  status: true,
  seatQuantity: true,
  aiCreditsUsed: true,
  aiCreditsBonus: true,
  aiCreditsPeriodStart: true,
  timezone: true,
  businessHourStart: true,
  businessHourEnd: true,
  leadRecoveryEnabled: true,
  leadRecoveryFirstMessageHours: true,
  leadRecoverySecondMessageHours: true,
  autoResolveAfterHours: true,
  autoResolveMessage: true,
  autoResolveTagName: true,
  autoResolveSkipWaiting: true,
  businessDays: true,
  awayMessageEnabled: true,
  awayMessageText: true,
  autoTranscribeAudio: true,
} as const;

type OrgAiRow = { [K in keyof typeof SELECT]: unknown } & {
  plan: PlanId;
  isInternal: boolean;
  status: OrganizationStatus;
  seatQuantity: number;
  aiCreditsUsed: number;
  aiCreditsBonus: number;
};

// El cliente nunca ve qué proveedor/modelo usan sus bots — solo sus créditos
// (con licencias, la suma de las personas de la organización).
async function serialize(organizationId: string, org: OrgAiRow) {
  const credits = await orgAiCreditSummary(organizationId);
  const { plan: _plan, isInternal: _internal, status: _status, seatQuantity: _seats, aiCreditsUsed: _used, aiCreditsBonus: _bonus, ...rest } = org;
  const limit = credits?.limit ?? 0;
  return {
    ...rest,
    aiCredits: { used: credits?.used ?? 0, limit: Number.isFinite(limit) ? limit : null },
  };
}

async function requireAdminOrg() {
  const session = await auth();
  if (!session?.user?.id) return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  if (session.user.role !== "admin") return { error: NextResponse.json({ error: "No autorizado" }, { status: 403 }) };
  return { organizationId: await requireOrgId(session.user.id) };
}

export async function GET() {
  try {
    const ctx = await requireAdminOrg();
    if ("error" in ctx) return ctx.error;
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: SELECT });
    return NextResponse.json(await serialize(ctx.organizationId, org));
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno") }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const ctx = await requireAdminOrg();
    if ("error" in ctx) return ctx.error;
    const parsed = orgAiSettingsUpdateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

    const current = await prisma.organization.findUniqueOrThrow({
      where: { id: ctx.organizationId },
      select: { businessHourStart: true, businessHourEnd: true, awayMessageEnabled: true, awayMessageText: true },
    });
    const start = parsed.data.businessHourStart ?? current.businessHourStart;
    const end = parsed.data.businessHourEnd ?? current.businessHourEnd;
    if (end <= start) return NextResponse.json({ error: "La hora de cierre debe ser posterior a la de apertura" }, { status: 400 });
    // El aviso fuera de horario necesita texto: activarlo sin texto (o borrar el
    // texto con el aviso activo) no manda nada y confunde.
    const awayEnabled = parsed.data.awayMessageEnabled ?? current.awayMessageEnabled;
    const awayText = parsed.data.awayMessageText !== undefined ? parsed.data.awayMessageText : current.awayMessageText;
    if (awayEnabled && !awayText) return NextResponse.json({ error: "Escribe el mensaje fuera de horario antes de activarlo" }, { status: 400 });

    const org = await prisma.organization.update({ where: { id: ctx.organizationId }, data: parsed.data, select: SELECT });
    return NextResponse.json(await serialize(ctx.organizationId, org));
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno") }, { status: 500 });
  }
}
