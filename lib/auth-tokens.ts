import { randomBytes } from "node:crypto";
import type { AuthToken, AuthTokenType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/crypto";

// Enlaces de un solo uso (verificación, restablecer contraseña, invitación).
// El token viaja solo en el correo; en la base queda su sha256.

const HOUR = 60 * 60 * 1000;
export const AUTH_TOKEN_TTL_MS: Record<AuthTokenType, number> = {
  EMAIL_VERIFY: 48 * HOUR,
  PASSWORD_RESET: 1 * HOUR,
  INVITE: 7 * 24 * HOUR,
};

interface IssueInput {
  type: AuthTokenType;
  email: string;
  userId?: string;
  organizationId?: string;
  role?: string;
  invitedById?: string;
}

// Emite un token nuevo e invalida los pendientes del mismo tipo para el mismo
// destinatario: solo el último enlace enviado funciona.
export async function issueAuthToken(input: IssueInput): Promise<{ token: string; record: AuthToken }> {
  const token = randomBytes(32).toString("base64url");
  const sameTarget = input.userId
    ? { userId: input.userId }
    : { organizationId: input.organizationId ?? null, email: input.email };
  const [, record] = await prisma.$transaction([
    prisma.authToken.deleteMany({ where: { type: input.type, usedAt: null, ...sameTarget } }),
    prisma.authToken.create({
      data: {
        type: input.type,
        tokenHash: hashToken(token),
        email: input.email,
        userId: input.userId,
        organizationId: input.organizationId,
        role: input.role,
        invitedById: input.invitedById,
        expiresAt: new Date(Date.now() + AUTH_TOKEN_TTL_MS[input.type]),
      },
    }),
  ]);
  return { token, record };
}

// Busca un token vigente (sin usar, sin vencer) del tipo esperado.
export async function findValidAuthToken(token: string | null | undefined, type: AuthTokenType): Promise<AuthToken | null> {
  if (!token || token.length > 200) return null;
  const record = await prisma.authToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!record || record.type !== type || record.usedAt || record.expiresAt <= new Date()) return null;
  return record;
}

// Consumo atómico: con dos requests simultáneos con el mismo enlace solo uno
// obtiene true.
export async function consumeAuthToken(id: string): Promise<boolean> {
  const { count } = await prisma.authToken.updateMany({
    where: { id, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  return count === 1;
}
