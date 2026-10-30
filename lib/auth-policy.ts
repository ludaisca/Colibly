import { isPlatformAdminEmailIn } from "./platform-admin-emails";

// Código que viaja en el redirect de NextAuth (query `code`) cuando las
// credenciales son correctas pero el correo no está confirmado. La pantalla de
// login lo usa para mostrar el aviso y el botón de reenvío.
export const EMAIL_NOT_VERIFIED_CODE = "email_not_verified";

// Regla de acceso por correo: la cuenta del dueño del SaaS (PLATFORM_ADMIN_EMAILS)
// está exenta para no quedar fuera de su propio panel; cualquier otra cuenta
// debe tener emailVerifiedAt. El dueño de una organización NO se exime: se
// crea al registrarse y sería un bypass del bloqueo anti-bots.
export function emailAllowsSignIn(input: {
  email: string;
  emailVerifiedAt: Date | null;
  platformAdminEmails: string | undefined;
}): boolean {
  if (input.emailVerifiedAt) return true;
  return isPlatformAdminEmailIn(input.platformAdminEmails, input.email);
}
