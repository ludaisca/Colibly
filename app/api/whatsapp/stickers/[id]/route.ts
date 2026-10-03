import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireOrgId } from "@/lib/tenancy";

type Context = { params: Promise<{ id: string }> };
export async function GET(_req: Request, { params }: Context) {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse(null, { status: 401 });
  const { id } = await params;
  const sticker = await prisma.wASticker.findFirst({ where: { id, organizationId: await requireOrgId(session.user.id) }, select: { data: true } });
  if (!sticker) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(sticker.data), { headers: { "Content-Type": "image/webp", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
export async function PATCH(req: Request, { params }: Context) {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse(null, { status: 401 });
  const { favorite } = await req.json().catch(() => ({}));
  if (typeof favorite !== "boolean") return NextResponse.json({ error: "Valor de favorito inválido" }, { status: 400 });
  const { id } = await params;
  const result = await prisma.wASticker.updateMany({ where: { id, organizationId: await requireOrgId(session.user.id) }, data: { favorite } });
  return NextResponse.json({ ok: result.count > 0 }, { status: result.count ? 200 : 404 });
}
export async function DELETE(_req: Request, { params }: Context) {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse(null, { status: 401 });
  const { id } = await params;
  const result = await prisma.wASticker.deleteMany({ where: { id, organizationId: await requireOrgId(session.user.id) } });
  return NextResponse.json({ ok: result.count > 0 }, { status: result.count ? 200 : 404 });
}
