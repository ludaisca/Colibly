import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { rateLimit } from "@/lib/rate-limit";
import { createPlatformToken, platformTokenError } from "@/lib/platform/tokens";
import { isPlatformScope, type PlatformScope } from "@/lib/platform/scopes";
import { logPlatformAction } from "@/lib/platform/audit";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  scopes: z.array(z.string()).min(1).max(6),
  environment: z.enum(["dev", "production"]),
  allowedCidrs: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

export async function GET() {
  const admin = await requirePlatformAdmin();
  if (admin instanceof NextResponse) return admin;

  const tokens = await prisma.platformApiToken.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      name: true,
      prefix: true,
      scopes: true,
      environment: true,
      allowedCidrs: true,
      createdByEmail: true,
      lastUsedAt: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ tokens }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const admin = await requirePlatformAdmin();
  if (admin instanceof NextResponse) return admin;

  const { allowed } = await rateLimit(`platform-tokens:${admin.email}`, 10, 3600);
  if (!allowed) return NextResponse.json({ error: "Demasiados tokens creados, espera una hora" }, { status: 429 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const scopes = parsed.data.scopes.filter(isPlatformScope) as PlatformScope[];
  if (scopes.length !== parsed.data.scopes.length) {
    return NextResponse.json({ error: "Algún permiso no es válido" }, { status: 400 });
  }

  try {
    const created = await createPlatformToken({
      name: parsed.data.name,
      scopes,
      environment: parsed.data.environment,
      allowedCidrs: parsed.data.allowedCidrs,
      createdByEmail: admin.email,
      expiresInDays: parsed.data.expiresInDays,
    });

    await logPlatformAction({
      actor: { type: "user", email: admin.email },
      action: "platform.token.create",
      target: { type: "platform_token", id: created.id },
      after: {
        name: parsed.data.name,
        scopes,
        environment: created.environment,
        allowedCidrs: created.allowedCidrs,
        expiresAt: created.expiresAt?.toISOString() ?? null,
      },
    });

    // El token en claro se devuelve UNA vez; no se guarda ni se vuelve a mostrar.
    return NextResponse.json(
      {
        ok: true,
        token: created.token,
        data: {
          id: created.id,
          prefix: created.prefix,
          scopes: created.scopes,
          environment: created.environment,
          allowedCidrs: created.allowedCidrs,
          expiresAt: created.expiresAt,
        },
      },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return platformTokenError(400, "invalid_request", error instanceof Error ? error.message : "No se pudo crear el token");
  }
}
