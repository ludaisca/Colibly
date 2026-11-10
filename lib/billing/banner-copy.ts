import type { BillingNotice } from "./state";
import { PLANS, TRIAL_PLAN } from "./plans";
import { formatInZone } from "@/lib/format/dates";

// Textos del aviso del plan (billing-banner.tsx). Aparte para probarlos sin React.

const TRIAL_PLAN_NAME = PLANS[TRIAL_PLAN].name;

export function bannerMessage(notice: BillingNotice): string {
  const date = notice.date ? formatInZone(notice.date, { day: "numeric", month: "long" }) : "";
  const days = notice.daysLeft ?? 0;
  switch (notice.kind) {
    case "trial_ending":
      if (notice.tone === "info") {
        return days === 1 ? `Tu prueba de ${TRIAL_PLAN_NAME} termina mañana.` : `Te quedan ${days} días de prueba de ${TRIAL_PLAN_NAME}.`;
      }
      if (days <= 0) return "Tu prueba termina hoy: elige un plan para no perder el acceso a tus chats y bots.";
      return days === 1
        ? "Queda 1 día: elige un plan para no perder el acceso a tus chats y bots."
        : `Quedan ${days} días: elige un plan para no perder el acceso a tus chats y bots.`;
    case "trial_expired":
      return "Tu prueba terminó y la cuenta quedó en solo lectura. Tus datos se conservan: elige un plan y sigues donde te quedaste.";
    case "past_due":
      return `No pudimos cobrar tu suscripción. Actualiza tu pago antes del ${date} para no pasar a solo lectura.`;
    case "read_only":
      return "Tu cuenta está en solo lectura: no se envían mensajes ni responden los bots.";
    case "canceled":
      return "Tu suscripción terminó y la cuenta está en solo lectura. Tus datos se conservan 60 días.";
    case "canceling":
      return `Cancelaste tu suscripción: sigue activa hasta el ${date}.`;
  }
}

export function bannerCta(notice: BillingNotice): string {
  switch (notice.kind) {
    case "trial_ending":
    case "trial_expired":
      return "Elegir plan";
    case "canceling":
      return "Ver planes";
    case "past_due":
      return "Actualizar pago";
    default:
      return "Reactivar";
  }
}

/** Solo los avisos informativos y de advertencia se pueden cerrar; los de peligro (cuenta sin funcionar) no. */
export function bannerDismissible(notice: BillingNotice): boolean {
  return notice.tone !== "danger";
}

export const BANNER_DISMISS_KEY_PREFIX = "colibly:trial-banner-dismissed:";

/** Clave de sessionStorage: reaparece otro día. */
export function bannerDismissKey(now: Date): string {
  return `${BANNER_DISMISS_KEY_PREFIX}${now.toISOString().slice(0, 10)}`;
}
