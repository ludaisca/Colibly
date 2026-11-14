import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { rateLimit } from "@/lib/rate-limit";
import { validateWhatsAppWebhookSignature } from "@/lib/meta/platform-app";
import { decryptFlowRequest, encryptFlowResponse, FlowDecryptError, forwardFlowRequest, type EncryptedFlowRequest } from "@/lib/whatsapp/flow-endpoint";

type Params = { params: Promise<{ accountId: string }> };

// Endpoint de datos de los WhatsApp Flows de una cuenta (lib/whatsapp/flow-endpoint.ts).
// Lo llama Meta, no una persona: responde texto cifrado (base64) o los códigos
// que Meta entiende — 421 = no se pudo descifrar (Meta vuelve a pedir la
// llave pública), 432 = firma inválida.
export async function POST(req: Request, { params }: Params) {
  const { accountId } = await params;
  const rl = await rateLimit(`flow-endpoint:${accountId}`, 600, 60);
  if (!rl.allowed) return new Response("Too many requests", { status: 429 });

  const account = /^[a-z0-9]{20,40}$/.test(accountId)
    ? await prisma.wAAccount.findUnique({
        where: { id: accountId },
        select: { id: true, connectionType: true, appSecret: true, flowPrivateKey: true, flowEndpointUrl: true, flowEndpointSecret: true },
      })
    : null;
  if (!account?.flowPrivateKey) return new Response("Not found", { status: 404 });

  const rawBody = await req.text();
  // Misma regla que el webhook: una cuenta MANUAL sin App Secret no puede validar la firma.
  if (account.connectionType !== "MANUAL" || account.appSecret) {
    const valid = await validateWhatsAppWebhookSignature(rawBody, req.headers.get("x-hub-signature-256"), account);
    if (!valid) return new Response("Invalid signature", { status: 432 });
  }

  let encrypted: EncryptedFlowRequest;
  try {
    encrypted = JSON.parse(rawBody) as EncryptedFlowRequest;
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  let decrypted;
  try {
    decrypted = decryptFlowRequest(encrypted, decrypt(account.flowPrivateKey));
  } catch (err) {
    if (err instanceof FlowDecryptError) return new Response("Decryption failed", { status: 421 });
    throw err;
  }
  const { body, aesKey, iv } = decrypted;
  const reply = (payload: unknown) => new Response(encryptFlowResponse(payload, aesKey, iv), { status: 200, headers: { "Content-Type": "text/plain" } });

  // Chequeo de salud de Meta.
  if (body.action === "ping") return reply({ data: { status: "active" } });

  // Aviso de error del cliente de WhatsApp: se reenvía (si hay URL) y se confirma.
  const data = body.data as Record<string, unknown> | undefined;
  if (data && typeof data === "object" && "error" in data) {
    void forwardFlowRequest(account, body).catch(() => {});
    return reply({ data: { acknowledged: true } });
  }

  const forwarded = await forwardFlowRequest(account, body);
  if (!forwarded.ok) {
    console.warn("[flow-endpoint] reenvío fallido", { accountId: account.id, action: body.action, error: forwarded.error });
    return new Response("Upstream error", { status: 500 });
  }
  return reply(forwarded.response);
}
