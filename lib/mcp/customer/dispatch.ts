import { createHash } from "crypto";
import { bindApiKeyHash } from "@/lib/api/bound-key";
import * as me from "@/app/api/v1/me/route";
import * as accounts from "@/app/api/v1/accounts/route";
import * as contacts from "@/app/api/v1/contacts/route";
import * as contact from "@/app/api/v1/contacts/[id]/route";
import * as contactTags from "@/app/api/v1/contacts/[id]/tags/route";
import * as conversations from "@/app/api/v1/conversations/route";
import * as conversation from "@/app/api/v1/conversations/[id]/route";
import * as conversationMessages from "@/app/api/v1/conversations/[id]/messages/route";
import * as messages from "@/app/api/v1/messages/route";
import * as templates from "@/app/api/v1/templates/route";
import * as tags from "@/app/api/v1/tags/route";
import * as teams from "@/app/api/v1/teams/route";
import * as users from "@/app/api/v1/users/route";
import * as automations from "@/app/api/v1/automations/route";
import * as automationRuns from "@/app/api/v1/automations/[id]/runs/route";

// Las herramientas del MCP de clientes no tienen lógica propia: cada una llama
// en el mismo proceso al handler de /api/v1 que ya existe, con la API key del
// cliente. Así heredan todo lo de la API — alcance de cuentas de la key,
// permisos, límites de velocidad, solo lectura (402), idempotencia, test keys
// y la forma pública de cada recurso — y un cambio de regla en la API llega
// solo al MCP. Detalle: docs/arquitectura/integraciones.md → "MCP de clientes".

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
type RouteModule = Partial<Record<"GET" | "POST" | "PATCH" | "DELETE", unknown>>;

export type ApiMethod = "GET" | "POST" | "PATCH" | "DELETE";

// Rutas y métodos que el MCP puede usar (y solo esos). Las rutas v1 exportan
// los 5 métodos (los que no atienden responden 405), así que el método va
// explícito aquí. `:id` captura un segmento.
const ROUTES: Array<{ pattern: string; methods: ApiMethod[]; module: RouteModule }> = [
  { pattern: "/me", methods: ["GET"], module: me },
  { pattern: "/accounts", methods: ["GET"], module: accounts },
  { pattern: "/contacts", methods: ["GET", "POST"], module: contacts },
  { pattern: "/contacts/:id", methods: ["GET", "PATCH"], module: contact },
  { pattern: "/contacts/:id/tags", methods: ["POST"], module: contactTags },
  { pattern: "/conversations", methods: ["GET"], module: conversations },
  { pattern: "/conversations/:id", methods: ["GET", "PATCH"], module: conversation },
  { pattern: "/conversations/:id/messages", methods: ["GET"], module: conversationMessages },
  { pattern: "/messages", methods: ["POST"], module: messages },
  { pattern: "/templates", methods: ["GET"], module: templates },
  { pattern: "/tags", methods: ["GET"], module: tags },
  { pattern: "/teams", methods: ["GET"], module: teams },
  { pattern: "/users", methods: ["GET"], module: users },
  { pattern: "/automations", methods: ["GET"], module: automations },
  { pattern: "/automations/:id/runs", methods: ["POST"], module: automationRuns },
];

/** Ruta de la API → handler y params. null si el MCP no la usa. Pura. */
export function matchRoute(method: ApiMethod, path: string): { handler: Handler; params: Record<string, string> } | null {
  const segments = path.split("/").filter(Boolean);
  for (const route of ROUTES) {
    if (!route.methods.includes(method)) continue;
    const parts = route.pattern.split("/").filter(Boolean);
    if (parts.length !== segments.length) continue;
    const params: Record<string, string> = {};
    const matches = parts.every((part, i) => {
      if (part === ":id") {
        // Ids de la API: cuid y similares. Nada de "..", "/" ni espacios.
        if (!/^[A-Za-z0-9_-]{1,64}$/.test(segments[i])) return false;
        params.id = segments[i];
        return true;
      }
      return part === segments[i];
    });
    if (!matches) continue;
    const handler = route.module[method];
    return typeof handler === "function" ? { handler: handler as Handler, params } : null;
  }
  return null;
}

/** Headers del request MCP que viajan a la API: la key y la IP del cliente (límite por IP). */
const FORWARDED_HEADERS = ["authorization", "x-forwarded-for", "x-real-ip", "cf-connecting-ip", "user-agent"];

export interface ApiCallResult {
  status: number;
  body: unknown;
}

export type ApiCaller = (
  method: ApiMethod,
  path: string,
  opts?: { query?: Record<string, string | number | boolean | undefined | null>; body?: unknown; idempotent?: boolean }
) => Promise<ApiCallResult>;

/**
 * Clave de idempotencia de un envío desde el MCP: la misma herramienta con los
 * mismos argumentos dentro de la misma ventana de 10 minutos es el mismo envío
 * (un modelo que reintenta una llamada no manda el mensaje dos veces). Pura.
 */
export function mcpIdempotencyKey(keyFingerprint: string, method: string, path: string, body: unknown, now = Date.now()): string {
  const bucket = Math.floor(now / (10 * 60_000));
  const hash = createHash("sha256").update(`${keyFingerprint}|${method}|${path}|${JSON.stringify(body ?? null)}|${bucket}`).digest("hex");
  return `mcp-${hash.slice(0, 48)}`;
}

/**
 * Arma el `ApiCaller` del request MCP (misma credencial, misma IP). Con
 * `keyHash` (conexión OAuth) la key va atada a cada Request (bound-key.ts) y
 * el access token no viaja a los handlers.
 */
export function apiCallerFor(mcpReq: Request, baseUrl: string, auth: { keyHash?: string } = {}): ApiCaller {
  const forwarded = new Headers();
  for (const name of FORWARDED_HEADERS) {
    const value = mcpReq.headers.get(name);
    if (value) forwarded.set(name, value);
  }
  if (auth.keyHash) forwarded.delete("authorization");
  const keyFingerprint = createHash("sha256").update(auth.keyHash ?? forwarded.get("authorization") ?? "").digest("hex").slice(0, 16);

  return async (method, path, opts = {}) => {
    const match = matchRoute(method, path);
    if (!match) return { status: 404, body: { error: { code: "not_found", message: `El MCP no usa ${method} ${path}` } } };

    const url = new URL(`/api/v1${path}`, baseUrl);
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
    const headers = new Headers(forwarded);
    let body: string | undefined;
    if (opts.body !== undefined) {
      headers.set("content-type", "application/json");
      body = JSON.stringify(opts.body);
    }
    if (opts.idempotent) headers.set("Idempotency-Key", mcpIdempotencyKey(keyFingerprint, method, path, opts.body));

    const apiReq = new Request(url, { method, headers, body });
    if (auth.keyHash) bindApiKeyHash(apiReq, auth.keyHash);
    const res = await match.handler(apiReq, { params: Promise.resolve(match.params) });
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    return { status: res.status, body: parsed };
  };
}
