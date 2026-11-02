import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { rateLimit } from "./rate-limit";
import { invalidateTenantCache } from "./tenancy";
import { clientIp } from "@/lib/net/client-ip";
import { emailAllowsSignIn, EMAIL_NOT_VERIFIED_CODE, TWO_FACTOR_INVALID_CODE, TWO_FACTOR_RATE_LIMITED_CODE, TWO_FACTOR_REQUIRED_CODE } from "./auth-policy";
import { verifySecondFactor } from "./two-factor";
import { consumeSessionNonce } from "./session-nonce";

// El JWT guarda rol y versión de sesión al iniciar sesión. Sin revalidar, un
// cambio de rol o la desactivación de un usuario no surtían efecto hasta que el
// token vencía (30 días). Cada SESSION_REVALIDATE_MS se vuelve a leer el
// usuario; el caché en memoria evita una consulta por request cuando la cookie
// no se puede reescribir (p. ej. dentro de un Server Component).
const SESSION_REVALIDATE_MS = 60_000;

// NextAuth incluye `code` en el redirect; la pantalla de login lo lee para
// distinguir "contraseña incorrecta" de "falta confirmar el correo".
class EmailNotVerifiedError extends CredentialsSignin {
  code = EMAIL_NOT_VERIFIED_CODE;
}
// Verificación en dos pasos: contraseña correcta, falta (o falla) el código.
class TwoFactorRequiredError extends CredentialsSignin {
  code = TWO_FACTOR_REQUIRED_CODE;
}
class TwoFactorInvalidError extends CredentialsSignin {
  code = TWO_FACTOR_INVALID_CODE;
}
class TwoFactorRateLimitedError extends CredentialsSignin {
  code = TWO_FACTOR_RATE_LIMITED_CODE;
}

interface UserSessionState {
  role: string;
  organizationId: string;
  disabled: boolean;
  sessionVersion: number;
  loadedAt: number;
}
const userStateCache = new Map<string, UserSessionState>();

async function loadUserSessionState(userId: string): Promise<UserSessionState | null> {
  const cached = userStateCache.get(userId);
  if (cached && Date.now() - cached.loadedAt < SESSION_REVALIDATE_MS) return cached;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      emailVerifiedAt: true,
      role: true,
      disabledAt: true,
      sessionVersion: true,
      organizationId: true,
      organization: { select: { status: true } },
    },
  });
  if (!user) {
    userStateCache.delete(userId);
    return null;
  }
  // Una organización suspendida por la plataforma no puede entrar (solo lectura
  // o cancelada sí: ven sus datos, los candados de facturación bloquean lo demás).
  // Un correo sin confirmar tampoco: la sesión emitida antes del cambio se cae
  // en la siguiente revalidación (60 s), salvo para el dueño del SaaS.
  const state = {
    role: user.role,
    organizationId: user.organizationId,
    disabled:
      !!user.disabledAt ||
      user.organization.status === "SUSPENDED" ||
      !emailAllowsSignIn({
        email: user.email,
        emailVerifiedAt: user.emailVerifiedAt,
        platformAdminEmails: process.env.PLATFORM_ADMIN_EMAILS,
      }),
    sessionVersion: user.sessionVersion,
    loadedAt: Date.now(),
  };
  userStateCache.set(userId, state);
  return state;
}

// Para que un cambio hecho por un admin (rol, desactivación) aplique de
// inmediato en este proceso en vez de esperar a que expire el caché.
export function invalidateUserSessionCache(userId: string) {
  userStateCache.delete(userId);
  invalidateTenantCache(userId);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Contraseña", type: "password" },
        code: { label: "Código de verificación", type: "text" },
      },
      async authorize(credentials, request) {
        if (!credentials?.email || !credentials?.password) return null;

        const ip = clientIp(request);
        const { allowed } = await rateLimit(`login:${ip}`, 5, 60);
        if (!allowed) return null;

        const email = (credentials.email as string).toLowerCase().trim();
        const password = credentials.password as string;

        const user = await prisma.user.findUnique({ where: { email }, include: { organization: { select: { status: true } } } });
        if (!user || !user.password || user.disabledAt || user.organization.status === "SUSPENDED") return null;

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return null;

        // Bloqueo anti-bots: sin correo confirmado no hay sesión. El dueño del
        // SaaS (PLATFORM_ADMIN_EMAILS) está exento.
        if (
          !emailAllowsSignIn({
            email: user.email,
            emailVerifiedAt: user.emailVerifiedAt,
            platformAdminEmails: process.env.PLATFORM_ADMIN_EMAILS,
          })
        ) {
          throw new EmailNotVerifiedError();
        }

        // Segundo paso (lib/two-factor.ts). Sin exenciones: tampoco el dueño
        // de la plataforma. Solo se revela que hay 2FA después de una
        // contraseña correcta.
        if (user.twoFactorEnabledAt) {
          const code = typeof credentials.code === "string" ? credentials.code : "";
          if (!code.trim()) throw new TwoFactorRequiredError();
          const result = await verifySecondFactor(user.id, code);
          if (result === "rate_limited") throw new TwoFactorRateLimitedError();
          if (result === "invalid") throw new TwoFactorInvalidError();
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          organizationId: user.organizationId,
          createdAt: user.createdAt.toISOString(),
          sessionVersion: user.sessionVersion,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      // "Cerrar las demás sesiones" sube sessionVersion; la sesión que lo pidió
      // se actualiza con un nonce de un solo uso (lib/session-nonce.ts) que
      // solo recibió ella. Cualquier otro campo de `session` se ignora.
      if (trigger === "update" && token.id) {
        const nonce = (session as { sessionNonce?: unknown } | undefined)?.sessionNonce;
        if (typeof nonce === "string") {
          const version = await consumeSessionNonce(token.id as string, nonce);
          if (version !== null) {
            token.sessionVersion = version;
            // Sin forzar revalidación: el caché de estado (60 s) podría tener
            // todavía la versión anterior. La ruta lo invalida al subirla.
            token.checkedAt = Date.now();
          }
        }
        return token;
      }

      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role ?? "user";
        token.organizationId = (user as { organizationId?: string }).organizationId;
        token.createdAt = (user as { createdAt?: string }).createdAt;
        token.sessionVersion = (user as { sessionVersion?: number }).sessionVersion ?? 0;
        token.checkedAt = Date.now();
        return token;
      }

      if (typeof token.checkedAt === "number" && Date.now() - token.checkedAt < SESSION_REVALIDATE_MS) {
        return token;
      }

      const state = await loadUserSessionState(token.id as string);
      // Usuario borrado, desactivado o con las sesiones revocadas → null
      // invalida la sesión. Tokens emitidos antes de existir sessionVersion
      // cuentan como versión 0 (el default), así que siguen siendo válidos.
      if (!state || state.disabled || state.sessionVersion !== (token.sessionVersion ?? 0)) {
        return null;
      }
      token.role = state.role;
      token.organizationId = state.organizationId;
      token.checkedAt = Date.now();
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.organizationId = token.organizationId as string;
        (session.user as { createdAt?: string }).createdAt = token.createdAt as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
