import { prisma } from "@/lib/prisma";
import { getOrgBusinessHours } from "@/lib/organizations";
import { DEFAULT_TIME_ZONE, formatInZone } from "@/lib/format/dates";

// Tick desatendido — mismo criterio de acotar el radio de explosión que
// lead-recovery-worker.ts/lead-scoring-worker.ts.
const CANDIDATE_POOL = 200;
// Ventana de búsqueda: no tiene sentido traer citas a más de 24h, ya que
// incluso el reminderMinutesBefore más largo permitido (10080 min = 7 días)
// rara vez se usa así — se amplía la ventana solo si hiciera falta.
const LOOKAHEAD_HOURS = 24;

export async function processAppointmentReminderTick() {
  const now = new Date();

  // reminderMinutesBefore varía por fila, así que "vencido" no se puede
  // expresar como una sola desigualdad SQL — se acota con una ventana amplia
  // en la query y se filtra la condición exacta en JS, mismo patrón que
  // lead-recovery-worker.ts usa para sus umbrales de horas de silencio.
  const candidates = await prisma.wAAppointment.findMany({
    where: {
      status: "SCHEDULED",
      remindedAt: null,
      scheduledAt: { lte: new Date(now.getTime() + LOOKAHEAD_HOURS * 3_600_000) },
    },
    select: {
      id: true,
      title: true,
      scheduledAt: true,
      reminderMinutesBefore: true,
      assignedToId: true,
      createdById: true,
      contact: {
        select: {
          name: true,
          realName: true,
          remoteJid: true,
          account: { select: { organizationId: true } },
          channelAccount: { select: { organizationId: true } },
        },
      },
    },
    orderBy: { scheduledAt: "asc" },
    take: CANDIDATE_POOL,
  });

  const due = candidates.filter(
    (a) => a.scheduledAt.getTime() - now.getTime() <= a.reminderMinutesBefore * 60_000
  );

  // La hora de la cita se escribe en la zona de su organización (el
  // contenedor corre en UTC).
  const zoneByOrg = new Map<string, string>();
  async function zoneFor(organizationId: string | undefined): Promise<string> {
    if (!organizationId) return DEFAULT_TIME_ZONE;
    if (!zoneByOrg.has(organizationId)) zoneByOrg.set(organizationId, (await getOrgBusinessHours(organizationId)).timezone);
    return zoneByOrg.get(organizationId)!;
  }

  for (const appointment of due) {
    try {
      const contactLabel = appointment.contact.realName ?? appointment.contact.name ?? appointment.contact.remoteJid;
      const timeZone = await zoneFor(appointment.contact.account?.organizationId ?? appointment.contact.channelAccount?.organizationId);
      const userId = appointment.assignedToId ?? appointment.createdById;

      await prisma.notification.create({
        data: {
          userId,
          type: "APPOINTMENT_REMINDER",
          title: `Cita próxima: ${appointment.title}`,
          body: `Con ${contactLabel} — ${formatInZone(appointment.scheduledAt, { dateStyle: "medium", timeStyle: "short" }, timeZone)}`,
          link: `/whatsapp/citas?id=${appointment.id}`,
        },
      });

      // Una sola pasada, no una secuencia de reintentos como
      // WALeadRecoveryAttempt — basta marcar remindedAt para no reprocesar.
      await prisma.wAAppointment.update({
        where: { id: appointment.id },
        data: { remindedAt: now },
      });
    } catch (err) {
      console.error(`[appointment-reminders] Error notificando la cita ${appointment.id}:`, err);
    }
  }
}
