import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/integrations/admin-session";
import { publicErrorMessage } from "@/lib/api-errors";
import { generateApiKey, serializeApiKey } from "@/lib/api/keys";
import { invalidateApiKeyCache } from "@/lib/api/auth-cache";
import { orgWhere, requireOrgId } from "@/lib/tenancy";
import { checkIntegrationFeature } from "@/lib/billing/entitlements";
import { rotationExpiry } from "@/lib/api/key-rotation";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({ graceHours: z.union([z.literal(0), z.literal(24)]).default(0) });

// Rotar una API key: crea una nueva con el mismo nombre, permisos, cuentas y
// vencimiento, a nombre de quien rota (la key vive mientras su dueño sea admin
// con la API en su licencia). La anterior se revoca ya o, con 24 h de gracia,
// vence en 24 h (o antes si ya vencía antes). El secreto nuevo se muestra una vez.
// No cuenta contra el tope de keys: reemplaza una que ya existía.
export async function POST(req: Request, { params }: Params) {
  try {
    const admin = await requireAdmin();
    if (admin instanceof NextResponse) return admin;
    const noApi = await checkIntegrationFeature(admin.userId, "api");
    if (noApi) return noApi;
    const { id } = await params;
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "graceHours debe ser 0 o 24" }, { status: 400 });

    const old = await prisma.apiKey.findFirst({ where: { id, ...(await orgWhere(admin.userId)) } });
    if (!old) return NextResponse.json({ error: "API key no encontrada" }, { status: 404 });
    const now = new Date();
    if (old.revokedAt || (old.expiresAt && old.expiresAt <= now)) {
      return NextResponse.json({ error: "Esta key ya no funciona: crea una nueva en lugar de rotarla" }, { status: 409 });
    }

    const { secret, prefix, keyHash } = generateApiKey();
    const oldUntil = rotationExpiry(old.expiresAt, parsed.data.graceHours, now);
    const [created] = await prisma.$transaction([
      prisma.apiKey.create({
        data: {
          userId: admin.userId,
          organizationId: await requireOrgId(admin.userId),
          name: old.name,
          prefix,
          keyHash,
          scopes: old.scopes,
          accountIds: old.accountIds,
          channelAccountIds: old.channelAccountIds,
          expiresAt: old.expiresAt,
        },
      }),
      prisma.apiKey.update({
        where: { id: old.id },
        data: oldUntil ? { expiresAt: oldUntil } : { revokedAt: now },
      }),
    ]);
    await invalidateApiKeyCache(old.keyHash);
    console.log(`[api-keys] ${admin.userId} rotó la key ${old.id} → ${created.id} (gracia ${parsed.data.graceHours} h)`);
    return NextResponse.json({ apiKey: serializeApiKey(created), secret, previousExpiresAt: oldUntil?.toISOString() ?? null }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}
