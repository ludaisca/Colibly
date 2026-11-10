import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAssignToContact } from "@/lib/appointments";
import { contactScopeWhere } from "@/lib/contacts/scope";
import { appointmentUpdateSchema } from "@/lib/validations";
import { enrollContactInTrigger } from "@/lib/sequences";
import { publicErrorMessage } from "@/lib/api-errors";
import { emitDomainEvent } from "@/lib/events/emit";
import { eventRefsForContact } from "@/lib/events/refs";

const CONTACT_SELECT = {
  id: true,
  name: true,
  realName: true,
  remoteJid: true,
  accountId: true,
  channelAccountId: true,
  isSample: true,
} as const;

const APPOINTMENT_SELECT = {
  id: true,
  title: true,
  notes: true,
  scheduledAt: true,
  durationMinutes: true,
  reminderMinutesBefore: true,
  status: true,
  source: true,
  cancelReason: true,
  createdAt: true,
  contact: { select: CONTACT_SELECT },
  assignedTo: { select: { id: true, name: true, email: true } },
  createdBy: { select: { id: true, name: true } },
} as const;

async function getOwnedAppointment(userId: string, role: string, appointmentId: string) {
  const scope = await contactScopeWhere(userId);
  const appointment = await prisma.wAAppointment.findFirst({
    where: {
      id: appointmentId,
      contact: { ...scope },
    },
    select: { ...APPOINTMENT_SELECT, assignedToId: true, contactId: true },
  });
  if (!appointment) return null;
  // ejecutivo solo puede tocar sus propias citas — mismo criterio que el
  // resto de la API (nav oculto + proxy.ts para /whatsapp/citas + este 403).
  if (role === "ejecutivo" && appointment.assignedToId !== userId) return null;
  return appointment;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const appointment = await getOwnedAppointment(session.user.id, session.user.role, id);
    if (!appointment) {
      return NextResponse.json({ error: "Cita no encontrada" }, { status: 404 });
    }

    return NextResponse.json(appointment);
  } catch (error) {
    const message = publicErrorMessage(error, "Error interno del servidor");
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

    const { id } = await params;
    const existing = await getOwnedAppointment(session.user.id, session.user.role, id);
    if (!existing) {
      return NextResponse.json({ error: "Cita no encontrada" }, { status: 404 });
    }

    const body = await req.json().catch(() => null);
    const parsed = appointmentUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    let assignedToId = parsed.data.assignedToId;
    if (assignedToId !== undefined && assignedToId !== null) {
      if (session.user.role === "ejecutivo") {
        assignedToId = session.user.id;
      } else if (
        assignedToId !== session.user.id &&
        !(await canAssignToContact(existing.contact, assignedToId))
      ) {
        return NextResponse.json({ error: "El usuario asignado no tiene acceso a esta cuenta" }, { status: 400 });
      }
    }

    const data: Record<string, unknown> = {};
    if (parsed.data.title !== undefined) data.title = parsed.data.title;
    if (parsed.data.notes !== undefined) data.notes = parsed.data.notes;
    if (parsed.data.durationMinutes !== undefined) data.durationMinutes = parsed.data.durationMinutes;
    if (assignedToId !== undefined) data.assignedToId = assignedToId;
    if (parsed.data.reminderMinutesBefore !== undefined) data.reminderMinutesBefore = parsed.data.reminderMinutesBefore;
    if (parsed.data.status !== undefined) data.status = parsed.data.status;
    if (parsed.data.cancelReason !== undefined) data.cancelReason = parsed.data.cancelReason;
    if (parsed.data.scheduledAt !== undefined) {
      data.scheduledAt = new Date(parsed.data.scheduledAt);
      // Reagendar invalida un recordatorio ya enviado (o pendiente calculado
      // sobre la hora vieja) — se recalcula desde cero contra la nueva hora.
      data.remindedAt = null;
    }

    const appointment = await prisma.wAAppointment.update({
      where: { id },
      data,
      select: APPOINTMENT_SELECT,
    });

    // Trigger de secuencias (roadmap P3-a) — solo en la transición REAL hacia
    // COMPLETED, no en cada PATCH que la deje en ese estado (evita
    // reinscribir si se editan notas/duración de una cita ya completada).
    if (parsed.data.status !== undefined && parsed.data.status !== existing.status) {
      const refs = await eventRefsForContact(existing.contactId);
      if (refs) {
        await emitDomainEvent({
          type: "appointment.status_changed",
          ...refs,
          data: { appointmentId: id, from: existing.status, to: parsed.data.status },
        });
      }
    }

    if (parsed.data.status === "COMPLETED" && existing.status !== "COMPLETED") {
      await enrollContactInTrigger("APPOINTMENT_COMPLETED", null, existing.contactId).catch((err) =>
        console.error("[appointments] enrollContactInTrigger falló:", err)
      );
    }

    return NextResponse.json(appointment);
  } catch (error) {
    const message = publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Reservado para limpiar entradas creadas por error — cancelar una cita real
// es un PATCH a status=CANCELLED (con cancelReason), no un DELETE, para que
// quede historial/auditoría. Ver plan P1.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const existing = await getOwnedAppointment(session.user.id, session.user.role, id);
    if (!existing) {
      return NextResponse.json({ error: "Cita no encontrada" }, { status: 404 });
    }

    await prisma.wAAppointment.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
