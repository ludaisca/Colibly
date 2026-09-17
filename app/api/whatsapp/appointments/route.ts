import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getContactScopeIds, canAssignToContact } from "@/lib/appointments";
import { appointmentSchema } from "@/lib/validations";
import { publicErrorMessage } from "@/lib/api-errors";

const TAKE = 500;

const CONTACT_SELECT = {
  id: true,
  name: true,
  realName: true,
  remoteJid: true,
  accountId: true,
  channelAccountId: true,
} as const;

// Recurso plano (no anidado bajo /contacts/[id]/), a diferencia de notas: la
// agenda necesita una vista cruzada entre contactos desde el día uno (agenda
// del día, "vencidas", etc.), no solo el historial de un contacto puntual.
// GET admite ?contactId= para el uso puntual desde ContactDrawer.
export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { accountIds, channelAccountIds } = await getContactScopeIds(session.user.id);

    const { searchParams } = new URL(req.url);
    const contactId = searchParams.get("contactId");
    const status = searchParams.get("status");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const upcoming = searchParams.get("upcoming") === "true";
    const limitParam = Number(searchParams.get("limit"));
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, TAKE) : TAKE;

    // ejecutivo solo ve/agenda lo suyo — mismo criterio defensa-en-profundidad
    // que el resto de la API (nav oculto + proxy.ts + 403/scoping aquí). Se
    // ignora cualquier ?assignedToId= que mande el cliente para ese rol.
    const assignedToId =
      session.user.role === "ejecutivo" ? session.user.id : searchParams.get("assignedToId");

    const andFilters: Record<string, unknown>[] = [
      { contact: { OR: [{ accountId: { in: accountIds } }, { channelAccountId: { in: channelAccountIds } }] } },
    ];
    if (contactId) andFilters.push({ contactId });
    if (assignedToId) andFilters.push({ assignedToId });
    if (status) andFilters.push({ status });
    if (upcoming) andFilters.push({ status: "SCHEDULED", scheduledAt: { gte: new Date() } });
    if (dateFrom) andFilters.push({ scheduledAt: { gte: new Date(dateFrom) } });
    if (dateTo) andFilters.push({ scheduledAt: { lte: new Date(dateTo) } });

    const appointments = await prisma.wAAppointment.findMany({
      where: { AND: andFilters },
      select: {
        id: true,
        title: true,
        notes: true,
        scheduledAt: true,
        durationMinutes: true,
        status: true,
        source: true,
        cancelReason: true,
        createdAt: true,
        contact: { select: CONTACT_SELECT },
        assignedTo: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { scheduledAt: "asc" },
      take: limit,
    });

    return NextResponse.json(appointments);
  } catch (error) {
    const message = publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = appointmentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { accountIds, channelAccountIds } = await getContactScopeIds(session.user.id);
    const contact = await prisma.contact.findFirst({
      where: {
        id: parsed.data.contactId,
        OR: [{ accountId: { in: accountIds } }, { channelAccountId: { in: channelAccountIds } }],
      },
      select: { id: true, accountId: true, channelAccountId: true },
    });
    if (!contact) {
      return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });
    }

    // ejecutivo solo puede agendarse citas a sí mismo.
    let assignedToId = parsed.data.assignedToId ?? session.user.id;
    if (session.user.role === "ejecutivo") {
      assignedToId = session.user.id;
    } else if (assignedToId !== session.user.id && !(await canAssignToContact(contact, assignedToId))) {
      return NextResponse.json({ error: "El usuario asignado no tiene acceso a esta cuenta" }, { status: 400 });
    }

    const appointment = await prisma.wAAppointment.create({
      data: {
        contactId: contact.id,
        title: parsed.data.title,
        notes: parsed.data.notes ?? null,
        scheduledAt: new Date(parsed.data.scheduledAt),
        durationMinutes: parsed.data.durationMinutes ?? undefined,
        assignedToId,
        createdById: session.user.id,
        reminderMinutesBefore: parsed.data.reminderMinutesBefore ?? undefined,
        originMessageId: parsed.data.originMessageId ?? null,
      },
      select: {
        id: true,
        title: true,
        notes: true,
        scheduledAt: true,
        durationMinutes: true,
        status: true,
        source: true,
        cancelReason: true,
        createdAt: true,
        contact: { select: CONTACT_SELECT },
        assignedTo: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(appointment, { status: 201 });
  } catch (error) {
    const message = publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
