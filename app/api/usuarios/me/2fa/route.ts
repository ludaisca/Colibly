import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { publicErrorMessage } from "@/lib/api-errors";
import {
  confirmTwoFactorSetup,
  disableTwoFactor,
  regenerateBackupCodes,
  startTwoFactorSetup,
  twoFactorStatus,
  verifySecondFactor,
} from "@/lib/two-factor";

// Verificación en dos pasos del propio usuario (cualquier rol). Bajo
// /api/usuarios para heredar la allowlist de solo lectura: proteger la cuenta
// no debe depender del estado de facturación.
//
// Todo lo que cambia la protección pide la contraseña actual (una sesión
// robada no puede quitarla ni ver códigos nuevos); quitarla pide además un
// código válido.

const NO_STORE = { "Cache-Control": "no-store" };

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("setup"), password: z.string().min(1).max(200) }),
  z.object({ action: z.literal("enable"), code: z.string().min(6).max(12) }),
  z.object({ action: z.literal("disable"), password: z.string().min(1).max(200), code: z.string().min(6).max(12) }),
  z.object({ action: z.literal("backup-codes"), password: z.string().min(1).max(200) }),
]);

async function passwordMatches(userId: string, password: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { password: true } });
  return !!user?.password && (await bcrypt.compare(password, user.password));
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  return NextResponse.json(await twoFactorStatus(session.user.id), { headers: NO_STORE });
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id || !session.user.email) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const userId = session.user.id;
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
    const body = parsed.data;

    if ("password" in body) {
      if (!(await rateLimit(`2fa-password:${userId}`, 10, 300)).allowed) {
        return NextResponse.json({ error: "Demasiados intentos; espera unos minutos" }, { status: 429 });
      }
      if (!(await passwordMatches(userId, body.password))) {
        return NextResponse.json({ error: "Contraseña incorrecta" }, { status: 400 });
      }
    }

    const status = await twoFactorStatus(userId);

    switch (body.action) {
      case "setup": {
        if (status.enabled) return NextResponse.json({ error: "La verificación en dos pasos ya está activa" }, { status: 409 });
        const setup = await startTwoFactorSetup(userId, session.user.email);
        return NextResponse.json(setup, { headers: NO_STORE });
      }
      case "enable": {
        if (status.enabled) return NextResponse.json({ error: "La verificación en dos pasos ya está activa" }, { status: 409 });
        const result = await confirmTwoFactorSetup(userId, body.code);
        if (result === "rate_limited") return NextResponse.json({ error: "Demasiados intentos; espera unos minutos" }, { status: 429 });
        if (result === "no_pending") return NextResponse.json({ error: "Vuelve a empezar la activación" }, { status: 409 });
        if (result === "invalid") return NextResponse.json({ error: "El código no coincide. Revisa la hora del teléfono e intenta con el código nuevo." }, { status: 400 });
        console.log(`[2fa] ${userId} activó la verificación en dos pasos`);
        return NextResponse.json({ enabled: true, backupCodes: result }, { headers: NO_STORE });
      }
      case "disable": {
        if (!status.enabled) return NextResponse.json({ enabled: false });
        const check = await verifySecondFactor(userId, body.code);
        if (check === "rate_limited") return NextResponse.json({ error: "Demasiados intentos; espera unos minutos" }, { status: 429 });
        if (check === "invalid") return NextResponse.json({ error: "Código incorrecto" }, { status: 400 });
        await disableTwoFactor(userId);
        console.log(`[2fa] ${userId} quitó la verificación en dos pasos`);
        return NextResponse.json({ enabled: false });
      }
      case "backup-codes": {
        if (!status.enabled) return NextResponse.json({ error: "Activa primero la verificación en dos pasos" }, { status: 409 });
        const codes = await regenerateBackupCodes(userId);
        return NextResponse.json({ backupCodes: codes }, { headers: NO_STORE });
      }
    }
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno") }, { status: 500 });
  }
}
