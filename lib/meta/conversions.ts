import { httpTimeout } from "@/lib/http-timeouts";

// Cliente de la Conversions API para el feedback loop de calificación de
// leads. El schema exacto del payload no está 100% confirmado por
// documentación pública (ver plan de Fase 1) — se valida empíricamente con
// `test_event_code` desde Events Manager antes de pasar cualquier
// MetaAdsAccount a mode:LIVE. Por eso este cliente loguea el body completo
// enviado y la respuesta completa de Meta (incluyendo error_user_msg y
// fbtrace_id) — permite ajustar el payload sin instrumentar nada más
// durante esa validación manual.
const GRAPH_API = "https://graph.facebook.com/v21.0";

export interface ConversionEventPayload {
  event_name: string;
  event_time: number;
  event_id: string;
  action_source: "system_generated" | "business_messaging";
  user_data: {
    lead_id?: string;
    ctwa_clid?: string;
  };
  custom_data?: {
    value?: number;
    currency?: string;
  };
}

interface SendConversionEventParams {
  datasetId: string;
  // Access token ya desencriptado — nunca loguear este valor.
  accessToken: string;
  event: ConversionEventPayload;
  testEventCode?: string | null;
  // true solo cuando MetaAdsAccount.mode === "LIVE". El cliente rechaza el
  // envío si esto es false Y no hay testEventCode — así un bug en el
  // orquestador (lib/meta/send-conversion.ts) no puede mandar un evento "en
  // el aire" sin que ninguno de los dos esté explícitamente confirmado.
  live: boolean;
}

export async function sendConversionEvent({
  datasetId,
  accessToken,
  event,
  testEventCode,
  live,
}: SendConversionEventParams): Promise<void> {
  if (!live && !testEventCode) {
    throw new Error(
      "Conversions API: ni test_event_code ni mode:LIVE están confirmados — envío rechazado para no contaminar el ad account."
    );
  }

  const url = `${GRAPH_API}/${datasetId}/events`;
  const body: Record<string, unknown> = { data: [event], access_token: accessToken };
  if (testEventCode) body.test_event_code = testEventCode;

  console.log(
    "[meta-conversions] request:",
    JSON.stringify({ url, data: [event], test_event_code: testEventCode ?? undefined })
  );

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: httpTimeout(),
  });

  const responseBody = await res.json().catch(() => ({}));
  console.log("[meta-conversions] response:", res.status, JSON.stringify(responseBody));

  if (!res.ok) {
    const message =
      responseBody?.error?.error_user_msg ?? responseBody?.error?.message ?? `Conversions API failed (HTTP ${res.status})`;
    const fbtrace = responseBody?.error?.fbtrace_id ? ` [fbtrace_id: ${responseBody.error.fbtrace_id}]` : "";
    throw new Error(`${message}${fbtrace}`);
  }
}

interface BuildPayloadParams {
  eventId: string;
  eventName: string;
  value?: number;
  currency?: string;
}

// Instant Forms: se identifica el lead por el lead_id de 15-17 dígitos que
// Meta asignó al llenar el formulario. action_source "system_generated" es
// el que Meta documenta para eventos de CRM que no ocurren en un servidor
// web propio.
export function buildInstantFormPayload(params: BuildPayloadParams & { metaLeadId: string }): ConversionEventPayload {
  return {
    event_name: params.eventName,
    event_time: Math.floor(Date.now() / 1000),
    event_id: params.eventId,
    action_source: "system_generated",
    user_data: { lead_id: params.metaLeadId },
    ...(params.value !== undefined ? { custom_data: { value: params.value, currency: params.currency ?? "MXN" } } : {}),
  };
}

// Click-to-WhatsApp: se identifica el lead por el ctwa_clid capturado en el
// primer mensaje entrante (ver lib/whatsapp/ingest-message.ts). action_source
// "business_messaging" es el que corresponde a conversaciones de mensajería,
// distinto del de Instant Forms.
export function buildCtwaPayload(params: BuildPayloadParams & { ctwaClid: string }): ConversionEventPayload {
  return {
    event_name: params.eventName,
    event_time: Math.floor(Date.now() / 1000),
    event_id: params.eventId,
    action_source: "business_messaging",
    user_data: { ctwa_clid: params.ctwaClid },
    ...(params.value !== undefined ? { custom_data: { value: params.value, currency: params.currency ?? "MXN" } } : {}),
  };
}
