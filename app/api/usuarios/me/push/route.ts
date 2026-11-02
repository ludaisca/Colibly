import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { publicErrorMessage } from "@/lib/api-errors";
import { getPlatformSettings } from "@/lib/platform-settings";

// Suscripción push del navegador actual (cualquier rol). Bajo /api/usuarios
// para heredar la allowlist de solo lectura: activar avisos no escribe datos
// de la organización. El endpoint es único: si otro usuario inicia sesión en
// el mismo navegador, la suscripción pasa a él.

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(1000).refine((value) => value.startsWith("https://"), "Endpoint inválido"),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const settings = await getPlatformSettings();
  return NextResponse.json({ publicKey: settings.vapidPrivateKey ? settings.vapidPublicKey : null });
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!(await rateLimit(`push-subscribe:${session.user.id}`, 10, 60)).allowed) {
      return NextResponse.json({ error: "Demasiados intentos" }, { status: 429 });
    }
    const parsed = subscriptionSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Suscripción inválida" }, { status: 400 });
    const userAgent = req.headers.get("user-agent")?.slice(0, 300) ?? null;
    const { endpoint, keys } = parsed.data;
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { endpoint, p256dh: keys.p256dh, auth: keys.auth, userId: session.user.id, userAgent },
      update: { p256dh: keys.p256dh, auth: keys.auth, userId: session.user.id, userAgent },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "No se pudo activar") }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const body = await req.json().catch(() => null);
    const endpoint = typeof body?.endpoint === "string" ? body.endpoint : null;
    if (!endpoint) return NextResponse.json({ error: "Falta el endpoint" }, { status: 400 });
    // Solo las propias: nunca borra la suscripción de otro usuario.
    await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: session.user.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "No se pudo desactivar") }, { status: 500 });
  }
}
