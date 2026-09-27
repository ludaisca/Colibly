import type { OrganizationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { appUrl, sendEmailSafely } from "@/lib/email/mailer";
import { billingNoticeTemplate } from "@/lib/email/templates";
import { RETENTION_DAYS_AFTER_CANCEL, RETENTION_DAYS_AFTER_TRIAL } from "./plans";

// Avisos de facturación a los admins de la organización: notificación en la
// campana (todos los admins activos) y, si se pide, correo.

const PLAN_LINK = "/configuracion/plan";

interface Notice {
  title: string;
  paragraphs: string[];
  email: boolean;
}

export async function notifyOrgAdmins(organizationId: string, notice: Notice): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { organizationId, role: "admin", disabledAt: null },
    select: { id: true, email: true },
  });
  if (admins.length === 0) return;
  await prisma.notification.createMany({
    data: admins.map((a) => ({ userId: a.id, type: "BILLING" as const, title: notice.title, body: notice.paragraphs[0] ?? null, link: PLAN_LINK })),
  });
  if (notice.email) {
    await Promise.all(
      admins.map((a) =>
        sendEmailSafely(
          billingNoticeTemplate({ to: a.email, title: notice.title, paragraphs: notice.paragraphs, ctaLabel: "Ver mi plan", url: appUrl(PLAN_LINK) }),
          "aviso de facturación"
        )
      )
    );
  }
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("es-MX", { day: "numeric", month: "long", timeZone: "America/Mexico_City" });
}

export function trialEndingNotice(daysLeft: number): Notice {
  return {
    title: daysLeft <= 1 ? "Tu prueba de SunflowCRM termina mañana" : `Tu prueba de SunflowCRM termina en ${daysLeft} días`,
    paragraphs: ["Elige un plan para seguir atendiendo a tus clientes sin interrupciones. Tus datos, canales y automatizaciones se conservan."],
    email: true,
  };
}

export function contactLimitNotice(max: number): Notice {
  return {
    title: "Llegaste al límite de contactos de tu plan",
    paragraphs: [
      `Tu plan incluye ${max.toLocaleString("es-MX")} contactos. Los mensajes de clientes nuevos se siguen guardando, pero ya no puedes agregar contactos a mano, por API ni con campañas.`,
      "Mejora tu plan para seguir creciendo.",
    ],
    email: true,
  };
}

// Aviso según la transición de estado (webhook de Stripe o tick horario).
export async function notifyBillingTransition(organizationId: string, from: OrganizationStatus, to: OrganizationStatus): Promise<void> {
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { graceEndsAt: true } });
  let notice: Notice | null = null;
  if (to === "ACTIVE" && from !== "ACTIVE") {
    notice = { title: "¡Tu plan está activo!", paragraphs: ["Gracias por tu pago. Todo funciona con normalidad."], email: false };
  } else if (to === "PAST_DUE") {
    const until = org?.graceEndsAt ? ` antes del ${formatDate(org.graceEndsAt)}` : "";
    notice = {
      title: "No pudimos cobrar tu suscripción",
      paragraphs: [`Actualiza tu método de pago${until} para que tu cuenta no pase a solo lectura. Mientras tanto, todo sigue funcionando.`],
      email: true,
    };
  } else if (to === "READ_ONLY") {
    notice = {
      title: from === "TRIALING" ? "Tu prueba de SunflowCRM terminó" : "Tu cuenta de SunflowCRM está en solo lectura",
      paragraphs: [
        "Tus datos siguen ahí, pero no se envían mensajes ni responden los bots y automatizaciones. Los mensajes de tus clientes se siguen recibiendo.",
        from === "TRIALING"
          ? `Elige un plan para reactivar todo al instante. Si no eliges uno, conservamos tus datos ${RETENTION_DAYS_AFTER_TRIAL} días y después se eliminan.`
          : "Elige un plan para reactivar todo al instante.",
      ],
      email: true,
    };
  } else if (to === "CANCELED") {
    notice = {
      title: "Tu suscripción de SunflowCRM terminó",
      paragraphs: [`Tu cuenta quedó en solo lectura. Conservamos tus datos ${RETENTION_DAYS_AFTER_CANCEL} días: si vuelves a suscribirte antes, todo sigue igual.`],
      email: true,
    };
  }
  if (notice) await notifyOrgAdmins(organizationId, notice);
}
