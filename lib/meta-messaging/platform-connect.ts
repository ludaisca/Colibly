import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/crypto";
import { getRedisClient } from "@/lib/redis";
import { graphUrl } from "@/lib/meta/graph";
import { httpTimeout } from "@/lib/http-timeouts";
import { getMetaPlatformApp } from "@/lib/meta/platform-app";
import { exchangeCodeForToken } from "@/lib/whatsapp/embedded-signup/meta";

// "Conectar con Facebook" para Messenger e Instagram con la app de Meta de
// Colibly (Inicio de sesión para empresas, PlatformSettings.metaMessagingConfigId),
// como el Embedded Signup de WhatsApp: el cliente no crea una app ni copia
// tokens. Dos pasos:
//   1. startMessagingConnect(code): canjea el código, lista las Páginas que
//      autorizó (con su Instagram vinculado) y guarda sus tokens cifrados en
//      Redis 15 min. Al navegador solo vuelven ids y nombres.
//   2. La persona elige qué conectar; account-crud crea cada ChannelAccount con
//      credentials.connection = "platform" (sin appSecret: el webhook se firma
//      con el de la plataforma, app/api/meta/webhook/messaging).

const SESSION_TTL_SECONDS = 15 * 60;
const sessionKey = (id: string) => `meta-msg-connect:${id}`;

export class MessagingConnectError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
  }
}

export interface ConnectablePage {
  id: string;
  name: string;
  instagram: { id: string; username: string | null } | null;
  /** Ya conectada en esta organización / en otra (no se puede repetir). */
  messenger: "available" | "connected" | "elsewhere";
  instagramState: "available" | "connected" | "elsewhere" | "none";
}

interface StoredPage {
  id: string;
  name: string;
  token: string;
  instagram: { id: string; username: string | null } | null;
}

interface StoredSession {
  userId: string;
  pages: StoredPage[];
}

/** Lo que el navegador necesita para abrir el diálogo. Nunca el App Secret. */
export async function messagingConnectConfig(): Promise<{ available: boolean; appId: string | null; configId: string | null }> {
  const app = await getMetaPlatformApp();
  const available = !!(app.appId && app.appSecret && app.messagingConfigId && app.webhookVerifyToken);
  return { available, appId: available ? app.appId : null, configId: available ? app.messagingConfigId : null };
}

async function graphGet<T>(path: string, params: Record<string, string>, token?: string): Promise<T> {
  const res = await fetch(graphUrl(path, params), { headers: token ? { Authorization: `Bearer ${token}` } : undefined, signal: httpTimeout() });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) throw new MessagingConnectError(json.error?.message ?? `Meta respondió HTTP ${res.status}`, 502);
  return json;
}

// Token de 60 días a partir del corto del diálogo: los tokens de Página que
// salen de él no vencen. Si Meta ya dio uno largo (token de sistema), se queda.
async function longLivedUserToken(appId: string, appSecret: string, token: string): Promise<string> {
  try {
    const json = await graphGet<{ access_token?: string }>("oauth/access_token", {
      grant_type: "fb_exchange_token",
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: token,
    });
    return json.access_token ?? token;
  } catch {
    return token;
  }
}

async function listPages(userToken: string): Promise<StoredPage[]> {
  type Raw = { id: string; name?: string; access_token?: string; instagram_business_account?: { id: string; username?: string } };
  const pages: StoredPage[] = [];
  let after: string | undefined;
  for (let i = 0; i < 5; i++) {
    const json = await graphGet<{ data?: Raw[]; paging?: { cursors?: { after?: string }; next?: string } }>("me/accounts", {
      fields: "id,name,access_token,instagram_business_account{id,username}",
      limit: "100",
      ...(after ? { after } : {}),
    }, userToken);
    for (const p of json.data ?? []) {
      if (!p.access_token) continue;
      pages.push({
        id: p.id,
        name: p.name ?? p.id,
        token: p.access_token,
        instagram: p.instagram_business_account ? { id: p.instagram_business_account.id, username: p.instagram_business_account.username ?? null } : null,
      });
    }
    after = json.paging?.next ? json.paging.cursors?.after : undefined;
    if (!after) break;
  }
  return pages;
}

/** Estado de cada Página para la lista: ya conectada aquí, en otra organización o libre. Pura. */
export function pageStates(
  pages: Array<Pick<StoredPage, "id" | "name" | "instagram">>,
  existing: Array<{ channel: string; externalAccountId: string | null; organizationId: string }>,
  organizationId: string
): ConnectablePage[] {
  const stateOf = (channel: string, externalId: string) => {
    const hit = existing.find((a) => a.channel === channel && a.externalAccountId === externalId);
    return !hit ? "available" : hit.organizationId === organizationId ? "connected" : "elsewhere";
  };
  return pages.map((p) => ({
    id: p.id,
    name: p.name,
    instagram: p.instagram,
    messenger: stateOf("MESSENGER", p.id),
    instagramState: p.instagram ? stateOf("INSTAGRAM", p.instagram.id) : "none",
  }));
}

export async function startMessagingConnect(userId: string, organizationId: string, code: string): Promise<{ sessionId: string; pages: ConnectablePage[] }> {
  const app = await getMetaPlatformApp();
  if (!app.appId || !app.appSecret || !app.messagingConfigId) throw new MessagingConnectError("La conexión con Facebook no está configurada en la plataforma", 503);

  const short = await exchangeCodeForToken({ appId: app.appId, appSecret: app.appSecret, code }).catch((err: Error) => {
    throw new MessagingConnectError(`Meta no aceptó la autorización: ${err.message}`, 502);
  });
  const userToken = await longLivedUserToken(app.appId, app.appSecret, short.accessToken);
  const pages = await listPages(userToken);
  if (pages.length === 0) throw new MessagingConnectError("No elegiste ninguna Página o tu usuario no administra ninguna. Vuelve a intentarlo y marca las Páginas que quieres conectar.");

  const sessionId = randomBytes(24).toString("base64url");
  const session: StoredSession = { userId, pages };
  await getRedisClient().set(sessionKey(sessionId), encrypt(JSON.stringify(session)), "EX", SESSION_TTL_SECONDS);

  const externalIds = pages.flatMap((p) => [p.id, ...(p.instagram ? [p.instagram.id] : [])]);
  const existing = await prisma.channelAccount.findMany({
    where: { channel: { in: ["MESSENGER", "INSTAGRAM"] }, externalAccountId: { in: externalIds } },
    select: { channel: true, externalAccountId: true, organizationId: true },
  });
  return { sessionId, pages: pageStates(pages, existing, organizationId) };
}

/** Lee (sin consumir) la sesión del paso 1; solo la persona que la abrió. */
export async function loadMessagingConnectSession(userId: string, sessionId: string): Promise<StoredPage[]> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(sessionId)) throw new MessagingConnectError("La sesión de conexión no es válida");
  const raw = await getRedisClient().get(sessionKey(sessionId));
  if (!raw) throw new MessagingConnectError("La conexión expiró. Vuelve a abrir el diálogo de Facebook.", 410);
  const session = JSON.parse(decrypt(raw)) as StoredSession;
  if (session.userId !== userId) throw new MessagingConnectError("La sesión de conexión no es tuya", 403);
  return session.pages;
}

export async function endMessagingConnectSession(sessionId: string): Promise<void> {
  await getRedisClient().del(sessionKey(sessionId));
}
