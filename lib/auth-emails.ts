import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { issueAuthToken } from "@/lib/auth-tokens";
import { appUrl, sendEmailSafely } from "@/lib/email/mailer";
import { invitationTemplate, passwordResetTemplate, verifyEmailTemplate } from "@/lib/email/templates";

// Flujos de correo de la cuenta: emiten el token y mandan el mensaje. Los
// llamadores los ejecutan dentro de after() para no retrasar la respuesta.

export async function sendVerificationEmail(user: { id: string; email: string; name: string | null }): Promise<void> {
  const { token } = await issueAuthToken({ type: "EMAIL_VERIFY", email: user.email, userId: user.id });
  await sendEmailSafely(verifyEmailTemplate({ to: user.email, name: user.name, url: appUrl(`/verificar-correo?token=${token}`) }), "verificación");
}

export async function sendPasswordResetEmail(user: { id: string; email: string; name: string | null }): Promise<void> {
  const { token } = await issueAuthToken({ type: "PASSWORD_RESET", email: user.email, userId: user.id });
  await sendEmailSafely(passwordResetTemplate({ to: user.email, name: user.name, url: appUrl(`/restablecer?token=${token}`) }), "restablecer contraseña");
}

export async function sendInvitationEmail(input: {
  token: string;
  email: string;
  role: string;
  organizationName: string;
  inviterName: string | null;
}): Promise<void> {
  await sendEmailSafely(
    invitationTemplate({
      to: input.email,
      organizationName: input.organizationName,
      inviterName: input.inviterName,
      role: input.role,
      url: appUrl(`/invitacion?token=${input.token}`),
    }),
    "invitación"
  );
}

// Conectar canales (y, desde S3, pagar) exige correo verificado: frena el uso
// de la prueba gratis con correos ajenos o inventados.
export async function requireVerifiedEmail(userId: string): Promise<NextResponse | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { emailVerifiedAt: true } });
  if (user?.emailVerifiedAt) return null;
  return NextResponse.json(
    { error: "Confirma tu correo antes de conectar canales. Revisa tu bandeja o reenvía el enlace desde el aviso superior.", code: "email_unverified" },
    { status: 403 }
  );
}
