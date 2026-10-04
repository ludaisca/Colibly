// Interpretación PURA de los mensajes que el diálogo de Embedded Signup manda al
// navegador por postMessage (type "WA_EMBEDDED_SIGNUP"). Vive aparte del
// componente para probarla sin navegador.

export type SignupSessionEvent =
  | { kind: "finish"; wabaId: string; phoneNumberId: string; coexistence: boolean }
  | { kind: "cancel"; step: string | null }
  | { kind: "error"; message: string }
  | { kind: "ignore" };

const FACEBOOK_ORIGIN = /^https:\/\/([a-z0-9-]+\.)*facebook\.com$/;

export function isFacebookOrigin(origin: string): boolean {
  return FACEBOOK_ORIGIN.test(origin);
}

export function parseSignupMessage(origin: string, raw: unknown): SignupSessionEvent {
  if (!isFacebookOrigin(origin) || typeof raw !== "string") return { kind: "ignore" };
  let data: { type?: string; event?: string; data?: Record<string, unknown> };
  try {
    data = JSON.parse(raw);
  } catch {
    return { kind: "ignore" };
  }
  if (data?.type !== "WA_EMBEDDED_SIGNUP") return { kind: "ignore" };

  const event = data.event ?? "";
  const payload = data.data ?? {};
  if (event === "FINISH" || event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING") {
    const wabaId = String(payload.waba_id ?? "");
    const phoneNumberId = String(payload.phone_number_id ?? "");
    // En el flujo de la app WhatsApp Business el evento puede traer solo waba_id
    // (el número lo informa después la API): se deja vacío y el servidor lo resuelve.
    if (!wabaId) return { kind: "error", message: "Meta no devolvió la cuenta de WhatsApp." };
    return { kind: "finish", wabaId, phoneNumberId, coexistence: event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING" };
  }
  if (event === "CANCEL") return { kind: "cancel", step: typeof payload.current_step === "string" ? payload.current_step : null };
  if (event === "ERROR") return { kind: "error", message: typeof payload.error_message === "string" ? payload.error_message : "Meta reportó un error durante la conexión." };
  return { kind: "ignore" };
}
