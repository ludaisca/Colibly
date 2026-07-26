import { auth } from "@/lib/auth";
import { type NextRequest, NextResponse } from "next/server";

const PROTECTED = ["/dashboard", "/configuracion", "/whatsapp", "/telegram", "/usuarios", "/estadisticas", "/ventas"];
// Ojo: las tres comprobaciones de rol viven DENTRO del bloque PROTECTED — una
// ruta ausente de esa lista no solo pierde el redirect a /login con
// callbackUrl, se salta también EXECUTIVE_BLOCKED/USER_BLOCKED por completo.
// Cualquier sección nueva (un canal adicional, p. ej.) debe entrar en PROTECTED
// aunque el layout ya redirija a los no autenticados.
const EXECUTIVE_BLOCKED = ["/dashboard", "/estadisticas", "/whatsapp/bots", "/whatsapp/campanas", "/whatsapp/plantillas", "/usuarios", "/whatsapp/cuentas", "/telegram/cuentas", "/configuracion/ia", "/ventas"];
// Regular "user" role keeps Panel/Estadísticas/Chats/Cuentas/Plantillas/Campañas/Config,
// but loses Contactos and Bots IA entirely (la antigua página /whatsapp/conocimiento se
// eliminó — el flujo de conocimiento vive en la pestaña del bot, ya bloqueada vía
// /whatsapp/bots). Calificadores de Leads stays reachable (route isn't blocked here) —
// that page restricts itself client-side to only the "Leads calificados" tab, since the
// CRUD tab isn't a separate route to block.
// /configuracion/ia (API keys, default provider/model, budget, lead recovery) is admin-only —
// only the account owner administers AI provider config, not shared/delegated roles.
const USER_BLOCKED = ["/whatsapp/contactos", "/whatsapp/bots", "/configuracion/ia"];
const AUTH = ["/login", "/register"];
const EXCLUDE = ["/_next", "/api", "/favicon.ico"];

export default async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;

  if (EXCLUDE.some((e) => path.startsWith(e))) {
    return NextResponse.next();
  }

  const session = await auth();
  const isLoggedIn = !!session?.user;
  const role = session?.user?.role;
  const isEjecutivo = role === "ejecutivo";
  const isRestrictedUser = role === "user";

  if (AUTH.some((r) => path.startsWith(r))) {
    if (isLoggedIn) {
      const target = isEjecutivo ? "/whatsapp/chat" : "/dashboard";
      return NextResponse.redirect(new URL(target, req.url));
    }
    return NextResponse.next();
  }

  if (PROTECTED.some((r) => path === r || path.startsWith(r + "/"))) {
    if (!isLoggedIn) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("callbackUrl", path);
      return NextResponse.redirect(loginUrl);
    }

    if (isEjecutivo && EXECUTIVE_BLOCKED.some((r) => path === r || path.startsWith(r + "/"))) {
      return NextResponse.redirect(new URL("/whatsapp/chat", req.url));
    }

    if (isRestrictedUser && USER_BLOCKED.some((r) => path === r || path.startsWith(r + "/"))) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
  }

  return NextResponse.next();
}
