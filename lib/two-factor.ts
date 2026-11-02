import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/crypto";
import { rateLimit } from "@/lib/rate-limit";
import { BRAND_NAME } from "@/lib/brand";
import {
  generateBackupCodes,
  generateTotpSecret,
  hashBackupCode,
  looksLikeBackupCode,
  otpauthUri,
  verifyTotp,
} from "@/lib/totp";

// Verificación en dos pasos (F7). TOTP con app autenticadora + 10 códigos de
// respaldo. El login la pide dentro del mismo `authorize` de NextAuth
// (lib/auth.ts): sin código responde `two_factor_required`, con código malo
// `two_factor_invalid`. Nadie está exento (tampoco PLATFORM_ADMIN_EMAILS).
//
// Recuperación: (1) un código de respaldo; (2) un admin de la organización
// puede quitarla a otro miembro (/usuarios); (3) si quien la perdió es el
// único admin, el operador de la plataforma (runbook en auth.md).

export type SecondFactorResult = "totp" | "backup" | "invalid" | "rate_limited";

/** 5 intentos de segundo factor por usuario cada 5 minutos (además del límite por IP del login). */
async function allowAttempt(userId: string): Promise<boolean> {
  return (await rateLimit(`2fa:${userId}`, 5, 300)).allowed;
}

/**
 * Valida un código TOTP o de respaldo de un usuario con 2FA activa. Un TOTP
 * ya aceptado no vale otra vez (twoFactorLastStep) y un código de respaldo se
 * consume en la misma sentencia que lo valida.
 */
export async function verifySecondFactor(userId: string, rawCode: string, nowMs = Date.now()): Promise<SecondFactorResult> {
  if (!(await allowAttempt(userId))) return "rate_limited";
  const code = rawCode.trim();
  if (!code) return "invalid";

  if (looksLikeBackupCode(code)) {
    const hash = hashBackupCode(code);
    const removed = await prisma.$executeRaw`
      UPDATE users SET two_factor_backup_codes = array_remove(two_factor_backup_codes, ${hash})
      WHERE id = ${userId} AND two_factor_enabled_at IS NOT NULL AND ${hash} = ANY(two_factor_backup_codes)`;
    return removed > 0 ? "backup" : "invalid";
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { twoFactorSecret: true, twoFactorEnabledAt: true } });
  if (!user?.twoFactorSecret || !user.twoFactorEnabledAt) return "invalid";
  const step = verifyTotp(decrypt(user.twoFactorSecret), code, nowMs);
  if (step === null) return "invalid";
  // Claim atómico del paso: el mismo código (o uno anterior) no se reutiliza.
  const claimed = await prisma.user.updateMany({
    where: { id: userId, OR: [{ twoFactorLastStep: null }, { twoFactorLastStep: { lt: step } }] },
    data: { twoFactorLastStep: step },
  });
  return claimed.count > 0 ? "totp" : "invalid";
}

/** Paso 1 de la activación: secreto pendiente + QR. No activa nada todavía. */
export async function startTwoFactorSetup(userId: string, email: string): Promise<{ secret: string; otpauthUrl: string; qrSvg: string }> {
  const secret = generateTotpSecret();
  await prisma.user.update({ where: { id: userId }, data: { twoFactorPendingSecret: encrypt(secret) } });
  const otpauthUrl = otpauthUri(secret, email, BRAND_NAME);
  const qrSvg = await QRCode.toString(otpauthUrl, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  return { secret, otpauthUrl, qrSvg };
}

/**
 * Paso 2: el primer código confirma que la app quedó bien configurada. Activa
 * la 2FA y devuelve los códigos de respaldo en claro (única vez que existen).
 */
export async function confirmTwoFactorSetup(userId: string, code: string, nowMs = Date.now()): Promise<string[] | "invalid" | "rate_limited" | "no_pending"> {
  if (!(await allowAttempt(userId))) return "rate_limited";
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { twoFactorPendingSecret: true } });
  if (!user?.twoFactorPendingSecret) return "no_pending";
  const secret = decrypt(user.twoFactorPendingSecret);
  const step = verifyTotp(secret, code, nowMs);
  if (step === null) return "invalid";
  const codes = generateBackupCodes();
  await prisma.user.update({
    where: { id: userId },
    data: {
      twoFactorSecret: encrypt(secret),
      twoFactorPendingSecret: null,
      twoFactorEnabledAt: new Date(nowMs),
      twoFactorBackupCodes: codes.map(hashBackupCode),
      twoFactorLastStep: step,
    },
  });
  return codes;
}

export async function regenerateBackupCodes(userId: string): Promise<string[]> {
  const codes = generateBackupCodes();
  await prisma.user.update({ where: { id: userId }, data: { twoFactorBackupCodes: codes.map(hashBackupCode) } });
  return codes;
}

/** Quita la 2FA (el propio usuario con contraseña + código, o un admin a otro miembro). */
export async function disableTwoFactor(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      twoFactorSecret: null,
      twoFactorPendingSecret: null,
      twoFactorEnabledAt: null,
      twoFactorBackupCodes: [],
      twoFactorLastStep: null,
    },
  });
}

export async function twoFactorStatus(userId: string): Promise<{ enabled: boolean; enabledAt: string | null; backupCodesLeft: number }> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { twoFactorEnabledAt: true, twoFactorBackupCodes: true } });
  return {
    enabled: !!user?.twoFactorEnabledAt,
    enabledAt: user?.twoFactorEnabledAt?.toISOString() ?? null,
    backupCodesLeft: user?.twoFactorEnabledAt ? user.twoFactorBackupCodes.length : 0,
  };
}

