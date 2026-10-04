import { NextResponse } from "next/server";
import { createHash } from "crypto";
import fs from "fs/promises";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireOrgId } from "@/lib/tenancy";
import { getUserAccountIds } from "@/lib/shared-accounts";
import { resolveAbsolutePath, isAccountMediaPath } from "@/lib/whatsapp/media-store";
import { validateSticker, STICKER_LIMIT, STICKER_MAX_BYTES } from "@/lib/whatsapp/stickers";
import { rateLimit } from "@/lib/rate-limit";
import { publicErrorMessage } from "@/lib/api-errors";

const select = { id: true, name: true, favorite: true, animated: true, lastUsedAt: true, createdAt: true } as const;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const organizationId = await requireOrgId(session.user.id);
  return NextResponse.json(await prisma.wASticker.findMany({ where: { organizationId }, select, orderBy: { createdAt: "desc" }, take: STICKER_LIMIT }));
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    if (!(await rateLimit(`sticker-upload:${session.user.id}`, 20, 60)).allowed) return NextResponse.json({ error: "Espera un momento antes de guardar más stickers" }, { status: 429 });
    const organizationId = await requireOrgId(session.user.id);
    let data: Buffer;
    let name: string;
    if (req.headers.get("content-type")?.includes("application/json")) {
      const body = await req.json();
      if (typeof body.messageId !== "string") return NextResponse.json({ error: "Mensaje requerido" }, { status: 400 });
      const message = await prisma.wAMessage.findFirst({ where: { id: body.messageId, messageType: "sticker", chat: { accountId: { in: await getUserAccountIds(session.user.id) } } }, include: { chat: { select: { accountId: true } } } });
      if (!message?.mediaUrl || !isAccountMediaPath(message.mediaUrl, message.chat.accountId)) return NextResponse.json({ error: "El sticker todavía no está disponible para guardar" }, { status: 404 });
      const path = resolveAbsolutePath(message.mediaUrl);
      if ((await fs.stat(path)).size > STICKER_MAX_BYTES) throw new Error("El sticker no puede superar 500 KB");
      data = await fs.readFile(path);
      name = message.filename || "Sticker recibido";
    } else {
      const length = Number(req.headers.get("content-length"));
      if (length > STICKER_MAX_BYTES + 16384) return NextResponse.json({ error: "El sticker no puede superar 500 KB" }, { status: 413 });
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File) || file.size > STICKER_MAX_BYTES) return NextResponse.json({ error: "Selecciona un WebP de hasta 500 KB" }, { status: 400 });
      data = Buffer.from(await file.arrayBuffer());
      name = file.name;
    }
    const { animated } = await validateSticker(data);
    const sha256 = createHash("sha256").update(data).digest("hex");
    const saved = await prisma.$transaction(async (tx) => {
      // Serializa altas de la misma organización para respetar el límite.
      await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${organizationId} FOR UPDATE`;
      const existing = await tx.wASticker.findUnique({ where: { organizationId_sha256: { organizationId, sha256 } }, select });
      if (existing) return existing;
      if (await tx.wASticker.count({ where: { organizationId } }) >= STICKER_LIMIT) throw new Error(`La biblioteca admite hasta ${STICKER_LIMIT} stickers; elimina uno para agregar otro`);
      return tx.wASticker.create({ data: { organizationId, sha256, name: name.slice(0, 100), data, animated }, select });
    });
    return NextResponse.json(saved, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "No se pudo guardar el sticker") }, { status: 400 });
  }
}
