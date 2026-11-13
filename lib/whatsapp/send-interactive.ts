import { decrypt } from "@/lib/crypto";
import type { WAAccount } from "@prisma/client";
import { httpTimeout } from "@/lib/http-timeouts";
import { assertOrgCanSend } from "@/lib/billing/gates";
import { MetaSendError } from "@/lib/whatsapp/send-errors";
import { GRAPH_API_BASE } from "@/lib/meta/graph";

export interface InteractiveButton {
  id: string; // generado por el caller (btn_1, btn_2...), nunca confiado del cliente
  title: string; // límite de Meta: 20 caracteres
}

export interface SendInteractiveParams {
  to: string;
  body: string;
  buttons: InteractiveButton[]; // 1-3, límite de Meta para reply buttons
  replyToWamid?: string;
}

// Único lugar que construye un payload type:"interactive" para la Graph API:
// botones de respuesta (máx. 3) y listas (máx. 10 filas). Los usan el
// composer del inbox, la API pública y las automatizaciones.
export async function sendInteractiveMessage(
  account: WAAccount,
  params: SendInteractiveParams
): Promise<{ wamid: string | null }> {
  await assertOrgCanSend(account.organizationId);
  return postInteractive(account, params.to, {
    type: "button",
    body: { text: params.body },
    action: {
      buttons: params.buttons.map((b) => ({ type: "reply", reply: { id: b.id, title: b.title } })),
    },
  }, params.replyToWamid);
}

export interface SendListParams {
  to: string;
  body: string;
  buttonLabel: string; // texto del botón que abre la lista (máx. 20)
  rows: { id: string; title: string; description?: string }[]; // 1-10
  replyToWamid?: string;
}

export async function sendInteractiveList(account: WAAccount, params: SendListParams): Promise<{ wamid: string | null }> {
  await assertOrgCanSend(account.organizationId);
  return postInteractive(account, params.to, {
    type: "list",
    body: { text: params.body },
    action: {
      button: params.buttonLabel,
      sections: [
        {
          title: params.buttonLabel.slice(0, 24),
          rows: params.rows.map((r) => ({ id: r.id, title: r.title, ...(r.description ? { description: r.description } : {}) })),
        },
      ],
    },
  }, params.replyToWamid);
}

export interface SendCtaUrlParams {
  to: string;
  body: string;
  label: string; // texto del botón (máx. 20)
  url: string; // https
  replyToWamid?: string;
}

// Botón que abre una URL (interactive cta_url). No genera respuesta del cliente.
export async function sendInteractiveCtaUrl(account: WAAccount, params: SendCtaUrlParams): Promise<{ wamid: string | null }> {
  await assertOrgCanSend(account.organizationId);
  return postInteractive(account, params.to, {
    type: "cta_url",
    body: { text: params.body },
    action: { name: "cta_url", parameters: { display_text: params.label, url: params.url } },
  }, params.replyToWamid);
}

// Botón "Enviar ubicación" (interactive location_request_message): la
// respuesta llega como un mensaje entrante type "location".
export async function sendInteractiveLocationRequest(
  account: WAAccount,
  params: { to: string; body: string; replyToWamid?: string }
): Promise<{ wamid: string | null }> {
  await assertOrgCanSend(account.organizationId);
  return postInteractive(account, params.to, {
    type: "location_request_message",
    body: { text: params.body },
    action: { name: "send_location" },
  }, params.replyToWamid);
}

// ── Catálogo (productos de Commerce Manager conectados a la WABA) ──────────

export interface ProductSection {
  title: string;
  productIds: string[]; // product_retailer_id (el "ID de contenido" del catálogo)
}

export type CatalogInteractive =
  | { kind: "product"; catalogId: string; productId: string; body?: string; footer?: string }
  | { kind: "product_list"; catalogId: string; header: string; body: string; footer?: string; sections: ProductSection[] }
  | { kind: "catalog"; body: string; footer?: string; thumbnailProductId?: string };

/** Objeto `interactive` de Meta para un producto, una lista de productos o el catálogo. Pura. */
export function catalogInteractive(c: CatalogInteractive): Record<string, unknown> {
  const footer = c.footer ? { footer: { text: c.footer } } : {};
  if (c.kind === "product") {
    return {
      type: "product",
      ...(c.body ? { body: { text: c.body } } : {}),
      ...footer,
      action: { catalog_id: c.catalogId, product_retailer_id: c.productId },
    };
  }
  if (c.kind === "product_list") {
    return {
      type: "product_list",
      header: { type: "text", text: c.header },
      body: { text: c.body },
      ...footer,
      action: {
        catalog_id: c.catalogId,
        sections: c.sections.map((s) => ({ title: s.title, product_items: s.productIds.map((id) => ({ product_retailer_id: id })) })),
      },
    };
  }
  return {
    type: "catalog_message",
    body: { text: c.body },
    ...footer,
    action: { name: "catalog_message", ...(c.thumbnailProductId ? { parameters: { thumbnail_product_retailer_id: c.thumbnailProductId } } : {}) },
  };
}

// ── WhatsApp Flows ─────────────────────────────────────────────────────────

export interface FlowInteractive {
  flowId: string;
  cta: string; // texto del botón (máx. 20)
  body: string;
  header?: string;
  footer?: string;
  flowToken: string;
  /** Primera pantalla. Sin ella el Flow arranca pidiendo datos a su endpoint (data_exchange). */
  screen?: string;
  data?: Record<string, unknown>;
  /** Un Flow en borrador (para probarlo antes de publicarlo). */
  draft?: boolean;
}

/** Objeto `interactive` de Meta para abrir un Flow. Pura. */
export function flowInteractive(f: FlowInteractive): Record<string, unknown> {
  return {
    type: "flow",
    ...(f.header ? { header: { type: "text", text: f.header } } : {}),
    body: { text: f.body },
    ...(f.footer ? { footer: { text: f.footer } } : {}),
    action: {
      name: "flow",
      parameters: {
        flow_message_version: "3",
        flow_token: f.flowToken,
        flow_id: f.flowId,
        flow_cta: f.cta,
        ...(f.draft ? { mode: "draft" } : {}),
        ...(f.screen
          ? { flow_action: "navigate", flow_action_payload: { screen: f.screen, ...(f.data && Object.keys(f.data).length ? { data: f.data } : {}) } }
          : { flow_action: "data_exchange" }),
      },
    },
  };
}

export async function sendInteractiveFlow(account: WAAccount, params: { to: string; flow: FlowInteractive; replyToWamid?: string }): Promise<{ wamid: string | null }> {
  await assertOrgCanSend(account.organizationId);
  return postInteractive(account, params.to, flowInteractive(params.flow), params.replyToWamid);
}

export async function sendInteractiveCatalog(account: WAAccount, params: { to: string; message: CatalogInteractive; replyToWamid?: string }): Promise<{ wamid: string | null }> {
  await assertOrgCanSend(account.organizationId);
  return postInteractive(account, params.to, catalogInteractive(params.message), params.replyToWamid);
}

async function postInteractive(account: WAAccount, to: string, interactive: Record<string, unknown>, replyToWamid?: string): Promise<{ wamid: string | null }> {
  if (!account.accessToken || !account.phoneNumberId) {
    throw new Error("La cuenta de WhatsApp no tiene accessToken/phoneNumberId configurados");
  }
  const accessToken = decrypt(account.accessToken);
  const phoneNumberId = account.phoneNumberId;

  const body = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive,
    ...(replyToWamid ? { context: { message_id: replyToWamid } } : {}),
  };

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
    const meta = (errorBody as { error?: { message?: string; code?: number } })?.error;
    throw new MetaSendError(meta?.message ?? `Error HTTP ${res.status}`, typeof meta?.code === "number" ? meta.code : null);
  }

  const responseData = (await res.json()) as { messages?: Array<{ id: string }> };
  return { wamid: responseData?.messages?.[0]?.id ?? null };
}
