import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserAccountIds, getUserChannelAccountIds } from "@/lib/shared-accounts";
import { sequenceSchema } from "@/lib/validations";
import { forbidRoles } from "@/lib/roles";
import { tagBelongsTo } from "@/lib/tags";

// Roadmap P3-a — secuencias de automatización lineales. Recurso plano (no
// nested bajo /accounts/[id], a diferencia de routing-rules) porque, igual
// que canned-responses, la UI lista secuencias de TODAS las cuentas del
// usuario a la vez — el selector de cuenta vive dentro del formulario, no en
// la URL. Alcance WhatsApp + Telegram únicamente (mismo límite que
// /score /scorers /suggest-reply): el motor solo sabe mandar por esos dos
// canales (lib/sequences.ts), Messenger/Instagram fallarían en runtime si se
// dejaran pasar sin este chequeo.
const SEQUENCE_SELECT = {
  id: true,
  waAccountId: true,
  channelAccountId: true,
  name: true,
  active: true,
  triggerType: true,
  triggerValue: true,
  exitOnReply: true,
  createdAt: true,
  waAccount: { select: { id: true, name: true } },
  channelAccount: { select: { id: true, name: true } },
  steps: { orderBy: { order: "asc" as const } },
  _count: { select: { enrollments: true } },
} as const;

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const waAccountId = searchParams.get("waAccountId");
    const channelAccountId = searchParams.get("channelAccountId");

    const [accountIds, channelAccountIds] = await Promise.all([
      getUserAccountIds(session.user.id),
      getUserChannelAccountIds(session.user.id),
    ]);

    if (waAccountId && !accountIds.includes(waAccountId)) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    }
    if (channelAccountId && !channelAccountIds.includes(channelAccountId)) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    }

    const where = waAccountId
      ? { waAccountId }
      : channelAccountId
        ? { channelAccountId }
        : { OR: [{ waAccountId: { in: accountIds } }, { channelAccountId: { in: channelAccountIds } }] };

    const sequences = await prisma.wASequence.findMany({
      where,
      select: SEQUENCE_SELECT,
      orderBy: { createdAt: "desc" },
    });

    // Inscripciones que se detuvieron sin completarse (envío fallido o fuera de
    // la ventana de 24h de WhatsApp) — la lista las señala para que no pasen
    // desapercibidas.
    const problems = sequences.length > 0
      ? await prisma.wASequenceEnrollment.groupBy({
          by: ["sequenceId"],
          where: { sequenceId: { in: sequences.map((s) => s.id) }, status: { in: ["FAILED", "EXPIRED"] } },
          _count: { _all: true },
        })
      : [];
    const problemsBySequence = new Map(problems.map((p) => [p.sequenceId, p._count._all]));

    return NextResponse.json(sequences.map((s) => ({ ...s, stoppedEnrollments: problemsBySequence.get(s.id) ?? 0 })));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno del servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const denied = forbidRoles(session, ["ejecutivo"]);
    if (denied) return denied;

    const body = await req.json();
    const parsed = sequenceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { waAccountId, channelAccountId, steps, ...data } = parsed.data;

    if (!waAccountId && !channelAccountId) {
      return NextResponse.json({ error: "Selecciona una cuenta" }, { status: 400 });
    }

    if (waAccountId) {
      const accountIds = await getUserAccountIds(session.user.id);
      if (!accountIds.includes(waAccountId)) {
        return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
      }
    } else {
      const channelAccountIds = await getUserChannelAccountIds(session.user.id);
      if (!channelAccountIds.includes(channelAccountId!)) {
        return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
      }
      const channelAccount = await prisma.channelAccount.findUnique({
        where: { id: channelAccountId! },
        select: { channel: true },
      });
      if (channelAccount?.channel !== "TELEGRAM") {
        return NextResponse.json({ error: "Secuencias no disponibles todavía para este canal" }, { status: 400 });
      }
    }

    if (data.triggerType === "TAG_ADDED") {
      if (!data.triggerValue) {
        return NextResponse.json({ error: "Selecciona una etiqueta" }, { status: 400 });
      }
      const tag = await prisma.tag.findUnique({ where: { id: data.triggerValue } });
      if (!tag || !tagBelongsTo(tag, { waAccountId, channelAccountId })) {
        return NextResponse.json({ error: "Etiqueta no encontrada" }, { status: 404 });
      }
    } else if (data.triggerType === "LEAD_STATUS_CHANGED") {
      if (!data.triggerValue || !["NEW", "CONTACTED", "QUALIFIED", "CUSTOMER", "LOST"].includes(data.triggerValue)) {
        return NextResponse.json({ error: "Estado de lead inválido" }, { status: 400 });
      }
    }

    const sequence = await prisma.wASequence.create({
      data: {
        ...data,
        waAccountId: waAccountId ?? null,
        channelAccountId: channelAccountId ?? null,
        triggerValue: data.triggerType === "APPOINTMENT_COMPLETED" ? null : data.triggerValue,
        createdById: session.user.id,
        steps: { create: steps.map((s, i) => ({ ...s, order: i })) },
      },
      select: SEQUENCE_SELECT,
    });

    return NextResponse.json(sequence, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno del servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
