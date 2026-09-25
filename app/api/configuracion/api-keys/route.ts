import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/integrations/admin-session";
import { generateApiKey, serializeApiKey } from "@/lib/api/keys";
import { isApiScope } from "@/lib/api/scopes";
import { getUserAccountIds, getUserChannelAccountIds } from "@/lib/shared-accounts";
import { publicErrorMessage } from "@/lib/api-errors";

const createSchema = z.object({
  name: z.string().trim().min(1, "El nombre es requerido").max(80),
  scopes: z.array(z.string()).min(1, "Elige al menos un permiso").refine((s) => s.every(isApiScope), "Permiso desconocido"),
  accountIds: z.array(z.string()).max(100).default([]),
  channelAccountIds: z.array(z.string()).max(100).default([]),
  // null = no expira
  expiresInDays: z.union([z.literal(30), z.literal(90), z.literal(365)]).nullable().default(null),
});

export async function GET() {
  try {
    const admin = await requireAdmin();
    if (admin instanceof NextResponse) return admin;
    const keys = await prisma.apiKey.findMany({ where: { userId: admin.userId }, orderBy: { createdAt: "desc" } });
    return NextResponse.json(keys.map(serializeApiKey));
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}

// Devuelve el secreto en claro UNA sola vez — solo se guarda su hash.
export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    if (admin instanceof NextResponse) return admin;

    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    const input = parsed.data;

    const [accountIds, channelAccountIds] = await Promise.all([
      getUserAccountIds(admin.userId),
      getUserChannelAccountIds(admin.userId),
    ]);
    if (input.accountIds.some((id) => !accountIds.includes(id)) || input.channelAccountIds.some((id) => !channelAccountIds.includes(id))) {
      return NextResponse.json({ error: "Cuenta no válida" }, { status: 400 });
    }

    const { secret, prefix, keyHash } = generateApiKey();
    const key = await prisma.apiKey.create({
      data: {
        userId: admin.userId,
        name: input.name,
        prefix,
        keyHash,
        scopes: input.scopes,
        accountIds: input.accountIds,
        channelAccountIds: input.channelAccountIds,
        expiresAt: input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000) : null,
      },
    });
    return NextResponse.json({ apiKey: serializeApiKey(key), secret }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}
