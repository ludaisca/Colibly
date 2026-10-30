import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isPlatformAdminEmailIn, parsePlatformAdminEmails } from "./platform-admin-emails";

// Operadores de la plataforma (quien vende Colibly, no un rol dentro de una
// organización): los correos de PLATFORM_ADMIN_EMAILS, separados por comas.
// Sin la variable no hay operadores y /plataforma no existe para nadie.

export function listPlatformAdminEmails(): string[] {
  return parsePlatformAdminEmails(process.env.PLATFORM_ADMIN_EMAILS);
}

export function isPlatformAdminEmail(email: string | null | undefined): boolean {
  return isPlatformAdminEmailIn(process.env.PLATFORM_ADMIN_EMAILS, email);
}

// Para rutas /api/plataforma: 404 (no 403) a quien no es operador, para no
// anunciar que la ruta existe.
export async function requirePlatformAdmin(): Promise<{ userId: string; email: string } | NextResponse> {
  const session = await auth();
  const email = session?.user?.email;
  if (!session?.user?.id || !isPlatformAdminEmail(email)) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return { userId: session.user.id, email: email! };
}
