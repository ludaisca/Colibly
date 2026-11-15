import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRedisClient } from "@/lib/redis";

export const dynamic = "force-dynamic";

const CHECK_TIMEOUT_MS = 2_000;

async function check(fn: () => Promise<unknown>): Promise<"ok" | "error"> {
  try {
    await Promise.race([
      fn(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), CHECK_TIMEOUT_MS)),
    ]);
    return "ok";
  } catch {
    return "error";
  }
}

// Healthcheck del contenedor (docker-compose.yml) — antes respondía "ok" sin
// tocar nada, así que el contenedor quedaba `healthy` con Postgres o Redis
// caídos. Ahora 503 si alguna dependencia no responde en 2 s.
export async function GET() {
  const [db, redis] = await Promise.all([
    check(() => prisma.$queryRaw`SELECT 1`),
    check(() => getRedisClient().ping()),
  ]);
  const healthy = db === "ok" && redis === "ok";
  // Público (QA-008): solo el estado. El detalle de qué falló no se publica;
  // el healthcheck mira el código HTTP y el doctor de /plataforma revisa cada
  // dependencia por su cuenta.
  return NextResponse.json({ status: healthy ? "ok" : "degraded" }, { status: healthy ? 200 : 503 });
}
