import { constants, createCipheriv, createDecipheriv, generateKeyPairSync, privateDecrypt } from "node:crypto";
import type { WAAccount } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/crypto";
import { appUrl } from "@/lib/app-url";
import { GRAPH_API_BASE } from "@/lib/meta/graph";
import { httpTimeout } from "@/lib/http-timeouts";
import { safeFetch } from "@/lib/net/safe-fetch";
import { generateWebhookSecret, SIGNATURE_HEADER, signWebhookBody } from "@/lib/webhooks/signature";
import { MetaAdminError } from "@/lib/whatsapp/account-admin";

// Endpoint de datos de WhatsApp Flows, alojado por Colibly. Un Flow con
// endpoint (data_exchange) llama a esta URL en cada pantalla; Meta cifra la
// solicitud con la llave pública del número. Colibly la descifra, la reenvía
// firmada (X-Colibly-Signature, igual que los webhooks) a la URL del
// integrador y cifra su respuesta de vuelta. Así el integrador no tiene que
// manejar llaves RSA ni el cifrado de Meta: recibe y contesta JSON.
//
// Cifrado de Meta: la llave AES-128 viaja cifrada con RSA-OAEP (SHA-256); el
// cuerpo, con AES-128-GCM (tag de 16 bytes al final). La respuesta se cifra
// con la misma llave y el IV invertido bit a bit.

export const FLOW_FORWARD_TIMEOUT_MS = 8_000;

export interface EncryptedFlowRequest {
  encrypted_flow_data: string;
  encrypted_aes_key: string;
  initial_vector: string;
}

export class FlowDecryptError extends Error {}

export interface DecryptedFlowRequest {
  body: Record<string, unknown>;
  aesKey: Buffer;
  iv: Buffer;
}

/** Pura (salvo el RSA): descifra la solicitud de Meta. Lanza FlowDecryptError. */
export function decryptFlowRequest(req: EncryptedFlowRequest, privateKeyPem: string): DecryptedFlowRequest {
  try {
    const aesKey = privateDecrypt({ key: privateKeyPem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, Buffer.from(req.encrypted_aes_key, "base64"));
    const data = Buffer.from(req.encrypted_flow_data, "base64");
    const iv = Buffer.from(req.initial_vector, "base64");
    const decipher = createDecipheriv("aes-128-gcm", aesKey, iv);
    decipher.setAuthTag(data.subarray(-16));
    const json = Buffer.concat([decipher.update(data.subarray(0, -16)), decipher.final()]).toString("utf8");
    return { body: JSON.parse(json) as Record<string, unknown>, aesKey, iv };
  } catch (err) {
    throw new FlowDecryptError(err instanceof Error ? err.message : String(err));
  }
}

export function encryptFlowResponse(response: unknown, aesKey: Buffer, iv: Buffer): string {
  const flipped = Buffer.from(iv.map((b) => ~b & 0xff));
  const cipher = createCipheriv("aes-128-gcm", aesKey, flipped);
  return Buffer.concat([cipher.update(JSON.stringify(response), "utf8"), cipher.final(), cipher.getAuthTag()]).toString("base64");
}

export function generateFlowKeyPair(): { publicKey: string; privateKey: string } {
  return generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}

export function flowEndpointUri(accountId: string): string {
  return appUrl(`/api/whatsapp/flows/endpoint/${accountId}`);
}

/** Sube la llave pública al número (Meta cifra con ella las solicitudes de sus Flows). */
async function uploadPublicKey(account: Pick<WAAccount, "phoneNumberId" | "accessToken">, publicKey: string): Promise<void> {
  if (!account.phoneNumberId || !account.accessToken) throw new MetaAdminError("La cuenta no tiene credenciales de Meta Cloud API", 422, null);
  const res = await fetch(`${GRAPH_API_BASE}/${encodeURIComponent(account.phoneNumberId)}/whatsapp_business_encryption`, {
    method: "POST",
    headers: { Authorization: `Bearer ${decrypt(account.accessToken)}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ business_public_key: publicKey }).toString(),
    signal: httpTimeout(),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string; error_user_msg?: string; code?: number } } | null;
    throw new MetaAdminError(body?.error?.error_user_msg || body?.error?.message || "Meta no aceptó la llave pública", res.status, body?.error?.code ?? null);
  }
}

export interface FlowEndpointState {
  endpointUri: string;
  url: string | null;
  keyUploadedAt: Date | null;
  /** Solo cuando se acaba de generar: guárdalo para validar la firma. */
  secret?: string;
}

export function flowEndpointState(account: Pick<WAAccount, "id" | "flowEndpointUrl" | "flowKeyUploadedAt">): FlowEndpointState {
  return { endpointUri: flowEndpointUri(account.id), url: account.flowEndpointUrl, keyUploadedAt: account.flowKeyUploadedAt };
}

/**
 * Configura a dónde se reenvían las solicitudes. La primera vez genera la
 * llave del número (y la sube a Meta) y el secreto de firma, que se devuelve
 * una sola vez. url null lo apaga (la llave queda).
 */
export async function configureFlowEndpoint(account: WAAccount, url: string | null, opts: { rotateSecret?: boolean } = {}): Promise<FlowEndpointState> {
  if (url === null) {
    const updated = await prisma.wAAccount.update({ where: { id: account.id }, data: { flowEndpointUrl: null } });
    return flowEndpointState(updated);
  }
  const data: Record<string, unknown> = { flowEndpointUrl: url };
  if (!account.flowPrivateKey || !account.flowKeyUploadedAt) {
    const { publicKey, privateKey } = generateFlowKeyPair();
    await uploadPublicKey(account, publicKey);
    data.flowPrivateKey = encrypt(privateKey);
    data.flowKeyUploadedAt = new Date();
  }
  let secret: string | undefined;
  if (!account.flowEndpointSecret || opts.rotateSecret) {
    secret = generateWebhookSecret();
    data.flowEndpointSecret = encrypt(secret);
  }
  const updated = await prisma.wAAccount.update({ where: { id: account.id }, data });
  return { ...flowEndpointState(updated), ...(secret ? { secret } : {}) };
}

export interface ForwardResult {
  ok: boolean;
  response?: Record<string, unknown>;
  error?: string;
}

/** Reenvía la solicitud descifrada al integrador y valida que conteste un objeto JSON. */
export async function forwardFlowRequest(account: Pick<WAAccount, "id" | "flowEndpointUrl" | "flowEndpointSecret">, body: Record<string, unknown>): Promise<ForwardResult> {
  if (!account.flowEndpointUrl || !account.flowEndpointSecret) return { ok: false, error: "Sin URL de reenvío configurada" };
  const payload = JSON.stringify({ accountId: account.id, ...body });
  try {
    const res = await safeFetch(account.flowEndpointUrl, {
      method: "POST",
      body: payload,
      timeoutMs: FLOW_FORWARD_TIMEOUT_MS,
      maxResponseBytes: 512 * 1024,
      headers: { "Content-Type": "application/json", [SIGNATURE_HEADER]: signWebhookBody(decrypt(account.flowEndpointSecret), payload), "X-Colibly-Event": "flow.data_exchange" },
    });
    if (res.status < 200 || res.status >= 300) return { ok: false, error: `HTTP ${res.status}` };
    const parsed = JSON.parse(res.body) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, error: "La respuesta no es un objeto JSON" };
    return { ok: true, response: parsed as Record<string, unknown> };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
