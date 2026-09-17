import { NextResponse } from "next/server";
import type { Session } from "next-auth";

export type AppRole = "admin" | "user" | "ejecutivo";

// proxy.ts excluye /api por completo: EXECUTIVE_BLOCKED/USER_BLOCKED solo
// protegen las PÁGINAS. Cualquier ruta que ejecute una acción de una sección
// bloqueada para un rol (enviar campañas, crear plantillas o secuencias,
// conectar cuentas...) debe repetir la restricción aquí — sin esto, el rol
// bloqueado la invoca igual con un fetch directo. Uso, justo después del
// chequeo de sesión:
//
//   const denied = forbidRoles(session, ["ejecutivo"]);
//   if (denied) return denied;
export function forbidRoles(session: Session, roles: readonly AppRole[]): NextResponse | null {
  const role = session.user?.role as AppRole | undefined;
  if (role && roles.includes(role)) {
    return NextResponse.json({ error: "Tu rol no tiene permiso para realizar esta acción" }, { status: 403 });
  }
  return null;
}
