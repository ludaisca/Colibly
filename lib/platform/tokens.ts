import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/crypto";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/net/client-ip";
import { ipAllowed } from "./ip-allowlist";
import { isPlatformScope, type PlatformScope, type PlatformTokenContext } from "./scopes";

// Tokens de operador de la plataforma. No son ApiKey (esa es por organización
// y para /api/v1): estos pueden tocar todas las organizaciones y la
// configuración de la plataforma, así que nacen read-only y con expiración.

export const PLATFORM_TOKEN_PREFIX = "plt_";
export const PLATFORM_TOKEN_DEFAULT_DAYS = 90;
export const PLATFORM_TOKEN_MAX_DAYS = 365;
export const PLATFORM_SECRET_TOKEN_MAX_HOURS = 24;

export interface CreatePlatformTokenInput {
  name: string;
  scopes: PlatformScope[];
  environment: "dev" | "production";
  allowedCidrs?: string[];
  createdByEmail: string;
  expiresInDays?: number;
}

export interface CreatedPlatformToken {
  id: string;
  token: string;
  prefix: string;
  scopes: PlatformScope[];
  environment: string;
  allowedCidrs: string[];
  expiresAt: Date | null;
}

export function platformTokenError(status: number, code: string, message: string, headers?: HeadersInit) {
  return NextResponse.json({ error: { code, message } }, { status, headers });
}

export async function createPlatformToken(input: CreatePlatformTokenInput): Promise<CreatedPlatformToken> {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 80) throw new Error("El nombre debe tener entre 2 y 80 caracteres");

  const scopes = [...new Set(input.scopes)];
  if (scopes.length === 0) throw new Error("Elige al menos un permiso");
  if (scopes.some((scope) => !isPlatformScope(scope))) throw new Error("Permiso no válido");

  const allowedCidrs = (input.allowedCidrs ?? []).map((cidr) => cidr.trim()).filter(Boolean);
  const withSecrets = scopes.includes("secret:write");
  if (withSecrets && allowedCidrs.length === 0) {
    throw new Error("El permiso secret:write exige una allowlist de IP");
  }

  const requestedDays = input.expiresInDays ?? PLATFORM_TOKEN_DEFAULT_DAYS;
  const days = withSecrets ? Math.min(requestedDays, PLATFORM_SECRET_TOKEN_MAX_HOURS / 24) : requestedDays;
  if (!Number.isFinite(days) || days <= 0 || days > PLATFORM_TOKEN_MAX_DAYS) {
    throw new Error(`La expiración debe estar entre 1 y ${PLATFORM_TOKEN_MAX_DAYS} días`);
  }
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  const envLabel = input.environment === "production" ? "production" : "dev";
  const token = `${PLATFORM_TOKEN_PREFIX}${envLabel}_${randomBytes(32).toString("base64url")}`;
  const prefix = token.slice(0, 24);

  const record = await prisma.platformApiToken.create({
    data: {
      name,
      prefix,
      tokenHash: hashToken(token),
      scopes,
      environment: envLabel,
      allowedCidrs,
      createdByEmail: input.createdByEmail,
      expiresAt,
    },
    select: { id: true, prefix: true, scopes: true, environment: true, allowedCidrs: true, expiresAt: true },
  });

  return {
    id: record.id,
    token,
    prefix: record.prefix,
    scopes: record.scopes as PlatformScope[],
    environment: record.environment,
    allowedCidrs: record.allowedCidrs,
    expiresAt: record.expiresAt,
  };
}

// Autentica un Bearer plt_ o poa_ (OAuth) sin exigir un scope concreto.
// Útil para el MCP, que decide el permiso por tool.
export async function authenticatePlatformCredential(req: Request): Promise<PlatformTokenContext | NextResponse> {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return platformTokenError(401, "unauthorized", "Falta el token de plataforma");

  const raw = match[1].trim();
  const ip = clientIp(req);

  const ipLimit = await rateLimit(`platform-token-ip:${ip}`, 300, 60);
  if (!ipLimit.allowed) return platformTokenError(429, "rate_limited", "Demasiadas solicitudes desde esta IP");

  if (raw.startsWith("plt_")) return authenticateApiToken(raw, ip);
  if (raw.startsWith("poa_")) {
    const { authenticateOAuthAccessToken } = await import("./oauth");
    return authenticateOAuthAccessToken(raw, null, ip);
  }
  return platformTokenError(401, "unauthorized", "Token de plataforma no válido");
}

export async function requirePlatformToken(req: Request, scope: PlatformScope): Promise<PlatformTokenContext | NextResponse> {
  const ctx = await authenticatePlatformCredential(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.scopes.includes(scope)) {
    return platformTokenError(403, "forbidden", `El token no tiene el permiso ${scope}`);
  }
  return ctx;
}

async function authenticateApiToken(raw: string, ip: string): Promise<PlatformTokenContext | NextResponse> {
  const token = await prisma.platformApiToken.findUnique({ where: { tokenHash: hashToken(raw) } });
  if (!token || token.revokedAt) return platformTokenError(401, "unauthorized", "Token de plataforma no válido");
  if (token.expiresAt && token.expiresAt.getTime() <= Date.now()) {
    return platformTokenError(401, "unauthorized", "El token de plataforma expiró");
  }
  // Un token marcado "dev" nunca opera un despliegue de producción. Al revés
  // sí se permite (probar un token de producción contra dev no toca dinero).
  if (token.environment === "dev" && process.env.NODE_ENV === "production") {
    return platformTokenError(403, "forbidden", "Este token es de desarrollo y no puede usarse en producción");
  }
  if (!ipAllowed(ip, token.allowedCidrs)) {
    return platformTokenError(403, "forbidden", "Esta IP no está autorizada para el token");
  }

  const limit = await rateLimit(`platform-token:${token.id}`, 60, 60);
  if (!limit.allowed) return platformTokenError(429, "rate_limited", "Límite de 60 solicitudes por minuto excedido");

  const scopes = token.scopes.filter(isPlatformScope);

  const now = Date.now();
  if (!token.lastUsedAt || now - token.lastUsedAt.getTime() > 60_000) {
    await prisma.platformApiToken.update({ where: { id: token.id }, data: { lastUsedAt: new Date(now) } }).catch(() => undefined);
  }

  return {
    tokenId: token.id,
    scopes,
    actorEmail: token.createdByEmail,
    environment: token.environment,
  };
}
