import type { LeadStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureDefaultPipeline } from "@/lib/pipeline/ensure";

// Datos de ejemplo del Spa Aurora (CDMX) para que una cuenta nueva vea el valor
// en dos minutos: contactos sin canal con etiquetas, tarjetas en el embudo y una
// cita para mañana. Todo lleva Contact.isSample = true: nunca se envía ni cuenta
// para límites, estadísticas, campañas, recordatorios, API ni exportaciones, y
// "Borrar datos de ejemplo" lo quita sin tocar nada real. Los teléfonos son
// ficticios (+52 55 0000 000X). Las conversaciones de ejemplo NO viven en la
// base de datos (un chat exige cuenta): son un fixture estático en
// lib/sample-data/sample-conversations.ts.

export interface SampleContact {
  /** Solo dígitos, como se guarda un remoteJid. */
  jid: string;
  name: string;
  leadStatus: LeadStatus;
  /** Valor del trato en pesos. */
  dealMxn: number | null;
  tags: string[];
}

export const SAMPLE_CONTACTS: SampleContact[] = [
  { jid: "525500000001", name: "Mariana López (ejemplo)", leadStatus: "QUALIFIED", dealMxn: 850, tags: ["Facial"] },
  { jid: "525500000002", name: "Carlos Ruiz (ejemplo)", leadStatus: "CONTACTED", dealMxn: 1200, tags: ["Masaje"] },
  { jid: "525500000003", name: "Sofía Hernández (ejemplo)", leadStatus: "CUSTOMER", dealMxn: 1800, tags: ["Facial", "Cliente frecuente"] },
  { jid: "525500000004", name: "Ana Torres (ejemplo)", leadStatus: "NEW", dealMxn: 650, tags: ["Masaje"] },
  { jid: "525500000005", name: "Daniela Pérez (ejemplo)", leadStatus: "LOST", dealMxn: 950, tags: [] },
];

export const SAMPLE_TAGS: { name: string; color: string }[] = [
  { name: "Facial", color: "accent" },
  { name: "Masaje", color: "accent" },
  { name: "Cliente frecuente", color: "accent" },
];

export const SAMPLE_APPOINTMENT = { title: "Facial hidratante – Mariana", forJid: "525500000001", hour: 11 } as const;

const MX_ZONE = "America/Mexico_City";

/** Mañana a las `hour`:00 en la Ciudad de México, como instante UTC (México ya no usa horario de verano: UTC-6). */
export function tomorrowAt(hour: number, now = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: MX_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day") + 1, hour + 6, 0, 0));
}

export async function sampleDataStatus(organizationId: string): Promise<{ loaded: boolean; count: number }> {
  const count = await prisma.contact.count({ where: { organizationId, isSample: true } });
  return { loaded: count > 0, count };
}

/** Idempotente: llamarlo dos veces deja los mismos 5 contactos. */
export async function seedSampleData(organizationId: string, userId: string, now = new Date()): Promise<{ created: number; total: number }> {
  const pipeline = await ensureDefaultPipeline(organizationId);
  const stageByStatus = new Map(pipeline.stages.filter((s) => s.leadStatus).map((s) => [s.leadStatus!, s.id]));

  // Etiquetas de la organización (únicas por nombre solo entre las sin cuenta).
  const tagIds = new Map<string, string>();
  for (const t of SAMPLE_TAGS) {
    const found = await prisma.tag.findFirst({ where: { organizationId, waAccountId: null, channelAccountId: null, name: t.name }, select: { id: true } });
    const tag = found ?? (await prisma.tag.create({ data: { organizationId, name: t.name, color: t.color }, select: { id: true } }));
    tagIds.set(t.name, tag.id);
  }

  const existing = await prisma.contact.findMany({
    where: { organizationId, accountId: null, channelAccountId: null, remoteJid: { in: SAMPLE_CONTACTS.map((c) => c.jid) } },
    select: { id: true, remoteJid: true },
  });
  const byJid = new Map(existing.map((c) => [c.remoteJid, c.id]));
  let created = 0;
  for (const c of SAMPLE_CONTACTS) {
    if (byJid.has(c.jid)) continue;
    const row = await prisma.contact.create({
      data: {
        organizationId,
        remoteJid: c.jid,
        name: c.name,
        nameSource: "user",
        source: "sample",
        isSample: true,
        leadStatus: c.leadStatus,
        pipelineStageId: stageByStatus.get(c.leadStatus) ?? null,
        dealValueCents: c.dealMxn === null ? null : c.dealMxn * 100,
        tags: { create: c.tags.map((name) => ({ tagId: tagIds.get(name)! })) },
      },
      select: { id: true },
    });
    byJid.set(c.jid, row.id);
    created++;
  }

  // La cita de mañana, una sola vez.
  const mariana = byJid.get(SAMPLE_APPOINTMENT.forJid);
  if (mariana && !(await prisma.wAAppointment.findFirst({ where: { contactId: mariana }, select: { id: true } }))) {
    await prisma.wAAppointment.create({
      data: {
        contactId: mariana,
        title: SAMPLE_APPOINTMENT.title,
        scheduledAt: tomorrowAt(SAMPLE_APPOINTMENT.hour, now),
        durationMinutes: 60,
        assignedToId: userId,
        createdById: userId,
      },
    });
  }
  return { created, total: SAMPLE_CONTACTS.length };
}

/** Quita los contactos de ejemplo (con sus citas, notas y etiquetas) y las etiquetas de ejemplo que queden sin uso. */
export async function deleteSampleData(organizationId: string): Promise<{ contacts: number; tags: number }> {
  const { count: contacts } = await prisma.contact.deleteMany({ where: { organizationId, isSample: true } });
  const { count: tags } = await prisma.tag.deleteMany({
    where: { organizationId, waAccountId: null, channelAccountId: null, name: { in: SAMPLE_TAGS.map((t) => t.name) }, contacts: { none: {} } },
  });
  return { contacts, tags };
}
