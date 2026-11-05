import type { OrganizationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { appUrl, sendEmailSafely } from "@/lib/email/mailer";
import { billingNoticeTemplate } from "@/lib/email/templates";
import { RETENTION_DAYS_AFTER_CANCEL, RETENTION_DAYS_AFTER_TRIAL } from "./plans";
import { BRAND_NAME } from "@/lib/brand";

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
    title: daysLeft <= 1 ? `Tu prueba de ${BRAND_NAME} termina mañana` : `Tu prueba de ${BRAND_NAME} termina en ${daysLeft} días`,
    paragraphs: [
      "Elige un plan para seguir atendiendo a tus clientes sin interrupciones. Tus datos, canales y automatizaciones se conservan.",
      "Si no eliges un plan, tu cuenta pasa a solo lectura el día que termina la prueba: podrás ver todo, pero no enviar mensajes ni usar bots o automatizaciones hasta contratar.",
    ],
    email: true,
  };
}

export function pastDueReminderNotice(daysLeft: number): Notice {
  return {
    title: daysLeft <= 1 ? "Mañana tu cuenta pasa a solo lectura" : `Tu cuenta pasa a solo lectura en ${daysLeft} días`,
    paragraphs: [
      "Seguimos sin poder cobrar tu suscripción. Actualiza tu tarjeta en \"Administrar facturación\" para que tus bots, automatizaciones y envíos sigan funcionando.",
      "Si el banco rechazó el cargo, a veces basta con autorizarlo en tu app bancaria o usar otra tarjeta. Tus datos no se pierden.",
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
      paragraphs: [
        `Actualiza tu método de pago${until} para que tu cuenta no pase a solo lectura. Mientras tanto, todo sigue funcionando.`,
        "Entra a tu plan y abre \"Administrar facturación\" para cambiar la tarjeta; el cobro se reintenta solo.",
      ],
      email: true,
    };
  } else if (to === "READ_ONLY") {
    notice = {
      title: from === "TRIALING" ? `Tu prueba de ${BRAND_NAME} terminó` : `Tu cuenta de ${BRAND_NAME} está en solo lectura`,
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
      title: `Tu suscripción de ${BRAND_NAME} terminó`,
      paragraphs: [`Tu cuenta quedó en solo lectura. Conservamos tus datos ${RETENTION_DAYS_AFTER_CANCEL} días: si vuelves a suscribirte antes, todo sigue igual.`],
      email: true,
    };
  }
  if (notice) await notifyOrgAdmins(organizationId, notice);
}
