import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// Operadores de la plataforma (quien vende Colibly, no un rol dentro de una
// organización): los correos de PLATFORM_ADMIN_EMAILS, separados por comas.
// Sin la variable no hay operadores y /plataforma no existe para nadie.

function platformAdminEmails(): Set<string> {
  return new Set(
    (process.env.PLATFORM_ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function listPlatformAdminEmails(): string[] {
  return [...platformAdminEmails()];
}

export function isPlatformAdminEmail(email: string | null | undefined): boolean {
  return !!email && platformAdminEmails().has(email.trim().toLowerCase());
}

// Para rutas /api/plataforma: 404 (no 403) a quien no es operador, para no
// anunciar que la ruta existe.
export async function requirePlatformAdmin(): Promise<{ userId: string; email: string } | NextResponse> {
  const session = await auth();
  const email = session?.user?.email;
  if (!session?.user?.id || !isPlatformAdminEmail(email)) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return { userId: session.user.id, email: email! };
}
