import { decrypt } from "@/lib/crypto";
import type { WAAccount } from "@prisma/client";
import { httpTimeout } from "@/lib/http-timeouts";

export interface InteractiveButton {
  id: string; // generado por el caller (btn_1, btn_2...), nunca confiado del cliente
  title: string; // límite de Meta: 20 caracteres
}

export interface SendInteractiveParams {
  to: string;
  body: string;
  buttons: InteractiveButton[]; // 1-3, límite de Meta para reply buttons
}

// Único lugar que construye un payload type:"interactive" (reply buttons) para
// la Graph API — mensajes de lista y botones generados por el bot de IA
// quedan fuera de alcance por ahora (ver AGENTS.md "Mensajes interactivos").
export async function sendInteractiveMessage(
  account: WAAccount,
  params: SendInteractiveParams
): Promise<{ wamid: string | null }> {
  if (!account.accessToken || !account.phoneNumberId) {
    throw new Error("La cuenta de WhatsApp no tiene accessToken/phoneNumberId configurados");
  }
  const accessToken = decrypt(account.accessToken);
  const phoneNumberId = account.phoneNumberId;

  const body = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: params.to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: params.body },
      action: {
        buttons: params.buttons.map((b) => ({
          type: "reply",
          reply: { id: b.id, title: b.title },
        })),
      },
    },
  };

  const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
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
    throw new Error(message);
  }

  const responseData = (await res.json()) as { messages?: Array<{ id: string }> };
  return { wamid: responseData?.messages?.[0]?.id ?? null };
}
