import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { rateLimit } from "./rate-limit";

// El JWT guarda rol y versión de sesión al iniciar sesión. Sin revalidar, un
// cambio de rol o la desactivación de un usuario no surtían efecto hasta que el
// token vencía (30 días). Cada SESSION_REVALIDATE_MS se vuelve a leer el
// usuario; el caché en memoria evita una consulta por request cuando la cookie
// no se puede reescribir (p. ej. dentro de un Server Component).
const SESSION_REVALIDATE_MS = 60_000;

interface UserSessionState {
  role: string;
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
    select: { role: true, disabledAt: true, sessionVersion: true },
  });
  if (!user) {
    userStateCache.delete(userId);
    return null;
  }
  const state = { role: user.role, disabled: !!user.disabledAt, sessionVersion: user.sessionVersion, loadedAt: Date.now() };
  userStateCache.set(userId, state);
  return state;
}

// Para que un cambio hecho por un admin (rol, desactivación) aplique de
// inmediato en este proceso en vez de esperar a que expire el caché.
export function invalidateUserSessionCache(userId: string) {
  userStateCache.delete(userId);
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
      },
      async authorize(credentials, request) {
        if (!credentials?.email || !credentials?.password) return null;

        const forwarded = request.headers.get("x-forwarded-for");
        const ip = forwarded?.split(",")[0]?.trim() ?? "unknown";
        const { allowed } = await rateLimit(`login:${ip}`, 5, 60);
        if (!allowed) return null;

        const email = (credentials.email as string).toLowerCase().trim();
        const password = credentials.password as string;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.password || user.disabledAt) return null;

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          createdAt: user.createdAt.toISOString(),
          sessionVersion: user.sessionVersion,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role ?? "user";
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
      token.checkedAt = Date.now();
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        (session.user as { createdAt?: string }).createdAt = token.createdAt as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
