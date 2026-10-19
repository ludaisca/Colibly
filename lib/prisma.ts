import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Pool de conexiones explícito. Sin connection_limit, Prisma usa
// núcleos × 2 + 1 (17 en el host de 8 hilos) por proceso, y la app y los
// workers comparten el mismo Postgres (max_connections 100 por defecto).
// DB_CONNECTION_LIMIT (y opcional DB_POOL_TIMEOUT, segundos) se agrega a
// DATABASE_URL si la URL no trae ya connection_limit. Vacío = default de Prisma.
// Recomendado en producción: DB_CONNECTION_LIMIT=20, DB_POOL_TIMEOUT=10
// (ver docs/LIMITES_API_2026-10-19.md).
export function databaseUrlWithPool(url: string | undefined, env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (!url) return url;
  const limit = Number(env.DB_CONNECTION_LIMIT);
  if (!Number.isInteger(limit) || limit <= 0 || /[?&]connection_limit=/.test(url)) return url;
  const params = [`connection_limit=${limit}`];
  const poolTimeout = Number(env.DB_POOL_TIMEOUT);
  if (Number.isInteger(poolTimeout) && poolTimeout > 0 && !/[?&]pool_timeout=/.test(url)) params.push(`pool_timeout=${poolTimeout}`);
  return `${url}${url.includes("?") ? "&" : "?"}${params.join("&")}`;
}

function createClient(): PrismaClient {
  const url = databaseUrlWithPool(process.env.DATABASE_URL);
  return url && url !== process.env.DATABASE_URL ? new PrismaClient({ datasources: { db: { url } } }) : new PrismaClient();
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
