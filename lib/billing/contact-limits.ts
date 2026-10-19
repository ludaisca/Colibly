import { prisma } from "@/lib/prisma";
import { getOrgBilling, getOrgUsage, orgIdForAccount } from "./gates";
import { planLimits } from "./state";
import { notifyOrgAdmins } from "./notify";

// Uso de contactos de la organización frente al límite del plan.
//  - 80 %: aviso; 100 %: ya no se agregan a mano/API/campañas (los entrantes
//    siguen creando contacto); >120 % (gracia agotada): los contactos más allá
//    del 120 %, por orden de creación, quedan `overLimit` y la IA/automatización
//    no corre para ellos hasta que el plan crezca o el uso baje.
export const CONTACT_WARNING_PCT = 80;
export const CONTACT_FULL_PCT = 100;
export const CONTACT_GRACE_PCT = 120;

export type ContactLimitLevel = "ok" | "warning" | "full" | "grace";

export interface ContactUsage {
  count: number;
  /** null = sin tope (interna). */
  max: number | null;
  pct: number | null;
  level: ContactLimitLevel;
  /** Hasta cuántos contactos funciona todo (120 % del límite). */
  graceCap: number | null;
  overLimitCount: number;
}

export function graceCap(max: number): number {
  return Math.floor((max * CONTACT_GRACE_PCT) / 100);
}

export function contactLimitLevel(count: number, max: number | null): ContactLimitLevel {
  if (max === null) return "ok";
  if (count > graceCap(max)) return "grace";
  if (count >= max) return "full";
  if (count * 100 >= max * CONTACT_WARNING_PCT) return "warning";
  return "ok";
}

// Umbral numérico para avisar (0 si no hay nada que avisar).
export function alertThreshold(level: ContactLimitLevel): number {
  return level === "grace" ? CONTACT_GRACE_PCT : level === "full" ? CONTACT_FULL_PCT : level === "warning" ? CONTACT_WARNING_PCT : 0;
}

// Decide si avisar: una vez por umbral y periodo; si el uso baja, el umbral
// guardado baja con él (y se vuelve a avisar al cruzarlo de nuevo).
export function nextAlertState(
  stored: { level: number; period: string | null },
  current: number,
  period: string
): { level: number; period: string; notify: boolean } {
  const base = stored.period === period ? stored.level : 0;
  if (current > base) return { level: current, period, notify: true };
  return { level: current, period, notify: false };
}

export async function getContactUsage(organizationId: string): Promise<ContactUsage> {
  const org = await getOrgBilling(organizationId);
  const [{ contacts }, overLimitCount] = await Promise.all([
    getOrgUsage(organizationId),
    prisma.contact.count({ where: { overLimit: true, OR: [{ account: { organizationId } }, { channelAccount: { organizationId } }] } }),
  ]);
  const rawMax = org ? planLimits(org).contacts : Infinity;
  const max = rawMax === Infinity ? null : rawMax;
  return {
    count: contacts,
    max,
    pct: max ? Math.round((contacts * 100) / max) : null,
    level: contactLimitLevel(contacts, max),
    graceCap: max === null ? null : graceCap(max),
    overLimitCount,
  };
}

function periodKey(org: { currentPeriodEnd: Date | null }, now: Date): string {
  return org.currentPeriodEnd ? `p:${org.currentPeriodEnd.toISOString().slice(0, 10)}` : `m:${now.toISOString().slice(0, 7)}`;
}

function alertNotice(threshold: number, max: number) {
  const n = max.toLocaleString("es-MX");
  if (threshold === CONTACT_GRACE_PCT) {
    return {
      title: "Superaste el 120 % de tus contactos: la IA ya no atiende a los nuevos",
      paragraphs: [
        `Tu plan incluye ${n} contactos y ya pasaste el margen de 120 %. Los contactos nuevos y sus mensajes se siguen guardando, pero bots, automatizaciones, secuencias y calificación con IA no corren para ellos.`,
        "Mejora tu plan o agrega ejecutivos en Plan y facturación para reactivarlos.",
      ],
      email: true,
    };
  }
  if (threshold === CONTACT_FULL_PCT) {
    return {
      title: "Llegaste al límite de contactos de tu plan",
      paragraphs: [
        `Tu plan incluye ${n} contactos. Los mensajes de clientes nuevos se siguen guardando, pero ya no puedes agregar contactos a mano, por API ni con campañas. Arriba del 120 % la IA y las automatizaciones dejan de correr para los contactos nuevos.`,
        "Mejora tu plan o agrega ejecutivos en Plan y facturación.",
      ],
      email: true,
    };
  }
  return {
    title: "Usas el 80 % de los contactos de tu plan",
    paragraphs: [`Tu plan incluye ${n} contactos. Mejora tu plan o agrega ejecutivos en Plan y facturación antes de llegar al límite.`],
    email: false,
  };
}

// Avisos de 80/100/120 % (campana a los admins; correo desde el 100 %).
export async function checkContactAlerts(organizationId: string, usage?: ContactUsage, now = new Date()): Promise<void> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { isInternal: true, currentPeriodEnd: true, contactAlertLevel: true, contactAlertPeriod: true },
  });
  if (!org || org.isInternal) return;
  const u = usage ?? (await getContactUsage(organizationId));
  if (u.max === null) return;
  const next = nextAlertState({ level: org.contactAlertLevel, period: org.contactAlertPeriod }, alertThreshold(u.level), periodKey(org, now));
  if (next.level === org.contactAlertLevel && next.period === org.contactAlertPeriod) return;
  // Condición sobre lo leído: dos procesos no avisan dos veces.
  const { count } = await prisma.organization.updateMany({
    where: { id: organizationId, contactAlertLevel: org.contactAlertLevel, contactAlertPeriod: org.contactAlertPeriod },
    data: { contactAlertLevel: next.level, contactAlertPeriod: next.period },
  });
  if (count > 0 && next.notify) await notifyOrgAdmins(organizationId, alertNotice(next.level, u.max));
}

// Recalcula overLimit de toda la organización: true exactamente para los
// contactos cuyo número de orden (created_at, id) supera el 120 % del límite.
export async function reconcileOverLimit(organizationId: string): Promise<ContactUsage> {
  const usage = await getContactUsage(organizationId);
  if (usage.graceCap === null || usage.count <= usage.graceCap) {
    if (usage.overLimitCount > 0) {
      await prisma.contact.updateMany({
        where: { overLimit: true, OR: [{ account: { organizationId } }, { channelAccount: { organizationId } }] },
        data: { overLimit: false },
      });
    }
    return { ...usage, overLimitCount: 0 };
  }
  const changed = await prisma.$executeRaw`
    WITH ranked AS (
      SELECT c.id, (row_number() OVER (ORDER BY c.created_at, c.id)) > ${usage.graceCap} AS over
      FROM contacts c
      LEFT JOIN wa_accounts a ON a.id = c."accountId"
      LEFT JOIN channel_accounts ch ON ch.id = c."channelAccountId"
      WHERE a.organization_id = ${organizationId} OR ch.organization_id = ${organizationId}
    )
    UPDATE contacts SET over_limit = ranked.over
    FROM ranked WHERE contacts.id = ranked.id AND contacts.over_limit <> ranked.over`;
  return changed > 0 ? getContactUsage(organizationId) : usage;
}

// Tras crear un contacto (entrante, historial, eco, API…): el más nuevo es el
// último en orden, así que basta con marcarlo si ya se pasó el 120 %. El tick
// de facturación hace el recálculo completo. Debe correr ANTES de despachar
// bots/automatizaciones del mismo mensaje.
export async function afterContactCreated(ref: { waAccountId?: string | null; channelAccountId?: string | null; organizationId?: string }, contactId: string): Promise<boolean> {
  try {
    const organizationId = ref.organizationId ?? (await orgIdForAccount(ref));
    if (!organizationId) return false;
    const usage = await getContactUsage(organizationId);
    const over = usage.graceCap !== null && usage.count > usage.graceCap;
    if (over) await prisma.contact.update({ where: { id: contactId }, data: { overLimit: true } });
    await checkContactAlerts(organizationId, usage);
    return over;
  } catch (err) {
    console.error("[contact-limits] afterContactCreated falló:", err);
    return false;
  }
}

// ¿Este contacto está fuera de la gracia? (para los candados de IA/automatización)
export async function isContactOverLimit(contactId: string | null | undefined): Promise<boolean> {
  if (!contactId) return false;
  const row = await prisma.contact.findUnique({ where: { id: contactId }, select: { overLimit: true } });
  return !!row?.overLimit;
}
