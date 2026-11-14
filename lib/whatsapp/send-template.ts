import { MetaSendError } from "@/lib/whatsapp/send-errors";
import { decrypt } from "@/lib/crypto";
import type { WAAccount } from "@prisma/client";
import { httpTimeout } from "@/lib/http-timeouts";
import { assertOrgCanSend } from "@/lib/billing/gates";
import { GRAPH_API_BASE } from "@/lib/meta/graph";

export interface SendTemplateParams {
  to: string;
  templateName: string;
  language: string;
  bodyParams?: string[];
  headerFormat?: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | null;
  // TEXT header → texto plano; IMAGE/VIDEO/DOCUMENT → Meta media id o una URL https pública.
  headerParam?: string | null;
  buttonIndex?: number | null;
  buttonParam?: string | null;
  replyToWamid?: string | null;
  // Componentes ya armados (lib/whatsapp/template-send.ts:buildTemplateSend);
  // si vienen, se ignoran bodyParams/headerParam/buttonParam.
  components?: Record<string, unknown>[];
}

// Único lugar que construye un payload type:"template" para la Graph API — usado por
// campaign-worker.ts (envío masivo) y lib/google/lead-sheet-import.ts (envío disparado
// por una fila nueva en una hoja externa). Lanza Error(mensaje) en fallo; cada caller
// decide cómo registrar ese fallo (WACampaignRecipient.FAILED, LeadSheetImportedRow, etc.).
export async function sendTemplateMessage(
  account: WAAccount,
  params: SendTemplateParams
): Promise<{ wamid: string | null }> {
  await assertOrgCanSend(account.organizationId);
  if (!account.accessToken || !account.phoneNumberId) {
    throw new Error("La cuenta de WhatsApp no tiene accessToken/phoneNumberId configurados");
  }
  const accessToken = decrypt(account.accessToken);
  const phoneNumberId = account.phoneNumberId;

  const body: Record<string, unknown> = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: params.to,
    type: "template",
    template: { name: params.templateName, language: { code: params.language } },
    ...(params.replyToWamid ? { context: { message_id: params.replyToWamid } } : {}),
  };

  const templateComponents: Record<string, unknown>[] = params.components ? [...params.components] : [];

  if (!params.components && params.bodyParams && params.bodyParams.length > 0) {
    templateComponents.push({
      type: "body",
      parameters: params.bodyParams.map((text) => ({ type: "text", text })),
    });
  }

  if (!params.components && params.headerParam && params.headerFormat) {
    if (params.headerFormat === "TEXT") {
      templateComponents.push({
        type: "header",
        parameters: [{ type: "text", text: params.headerParam }],
      });
    } else {
      const mediaType = params.headerFormat.toLowerCase();
      // La API pública documenta una URL https; las campañas pasan el id de un
      // medio ya subido a Meta. Meta acepta `link` o `id` según el caso.
      const media = /^https:\/\//i.test(params.headerParam) ? { link: params.headerParam } : { id: params.headerParam };
      templateComponents.push({
        type: "header",
        parameters: [{ type: mediaType, [mediaType]: media }],
      });
    }
  }

  if (!params.components && params.buttonParam && params.buttonIndex !== null && params.buttonIndex !== undefined) {
    templateComponents.push({
      type: "button",
      sub_type: "url",
      index: String(params.buttonIndex),
      parameters: [{ type: "text", text: params.buttonParam }],
    });
  }

  if (templateComponents.length > 0) {
    (body.template as Record<string, unknown>).components = templateComponents;
  }

  const url = `${GRAPH_API_BASE}/${phoneNumberId}/messages`;
  const requestInit: RequestInit = {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };

  let res = await fetch(url, { ...requestInit, signal: httpTimeout() });

  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("Retry-After") || "5");
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    res = await fetch(url, { ...requestInit, signal: httpTimeout() });
  }

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    const message =
      (errorBody as { error?: { message?: string } })?.error?.message ?? `Error HTTP ${res.status}`;
    const code = (errorBody as { error?: { code?: unknown } })?.error?.code;
    throw new MetaSendError(message, typeof code === "number" ? code : null);
  }

  const responseData = (await res.json()) as { messages?: Array<{ id: string }> };
  return { wamid: responseData?.messages?.[0]?.id ?? null };
}
