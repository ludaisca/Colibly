import { auth } from "@/lib/auth";
import { type NextRequest, NextResponse } from "next/server";
import { getOrgAccess, readOnlyResponse } from "@/lib/billing/gates";

const PROTECTED = ["/dashboard", "/configuracion", "/whatsapp", "/telegram", "/messenger", "/instagram", "/webchat", "/usuarios", "/estadisticas", "/ventas", "/meta-ads"];
// Ojo: las tres comprobaciones de rol viven DENTRO del bloque PROTECTED — una
// ruta ausente de esa lista no solo pierde el redirect a /login con
// callbackUrl, se salta también EXECUTIVE_BLOCKED/USER_BLOCKED por completo.
// Cualquier sección nueva (un canal adicional, p. ej.) debe entrar en PROTECTED
// aunque el layout ya redirija a los no autenticados.
const EXECUTIVE_BLOCKED = ["/dashboard", "/estadisticas", "/whatsapp/bots", "/whatsapp/campanas", "/whatsapp/plantillas", "/usuarios", "/whatsapp/cuentas", "/telegram/cuentas", "/messenger/cuentas", "/instagram/cuentas", "/webchat/cuentas", "/configuracion/ia", "/configuracion/api", "/configuracion/plan", "/ventas", "/meta-ads", "/whatsapp/secuencias", "/whatsapp/automatizaciones"];
// Regular "user" role keeps Panel/Estadísticas/Chats/Cuentas/Plantillas/Campañas/Config,
// but loses Contactos and Bots IA entirely (la antigua página /whatsapp/conocimiento se
// eliminó — el flujo de conocimiento vive en la pestaña del bot, ya bloqueada vía
// /whatsapp/bots). Calificadores de Leads stays reachable (route isn't blocked here) —
// that page restricts itself client-side to only the "Leads calificados" tab, since the
// CRUD tab isn't a separate route to block.
// /configuracion/ia (API keys, default provider/model, budget, lead recovery) is admin-only —
// only the account owner administers AI provider config, not shared/delegated roles.
// /meta-ads es admin-only (credenciales de negocio sensibles, sin
// WAAccountShare equivalente) — mismo criterio que /configuracion/ia.
const USER_BLOCKED = ["/whatsapp/contactos", "/whatsapp/bots", "/configuracion/ia", "/configuracion/api", "/configuracion/plan", "/meta-ads"];
// /verificar-correo e /invitacion no van aquí: funcionan con o sin sesión.
const AUTH = ["/login", "/register", "/recuperar", "/restablecer"];
const EXCLUDE = ["/_next", "/favicon.ico"];

// Solo lectura (prueba vencida, impago tras la gracia, cancelada): la UI puede
// leer todo pero ninguna mutación de /api pasa, salvo lo necesario para salir
// de ese estado (pagar, cuenta, equipo) o para no molestar (notificaciones).
// Las rutas públicas (webhooks de Meta/Telegram, widget, API v1 con key) no
// traen sesión y siguen su curso: lo entrante se guarda igual, y los envíos
// tienen su propio candado en los emisores y en la API v1.
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const READ_ONLY_ALLOWED = ["/api/auth", "/api/billing", "/api/usuarios", "/api/whatsapp/notifications"];

export default async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;

  if (EXCLUDE.some((e) => path.startsWith(e))) {
    return NextResponse.next();
  }

  if (path.startsWith("/api")) {
    if (SAFE_METHODS.has(req.method) || READ_ONLY_ALLOWED.some((r) => path === r || path.startsWith(r + "/"))) {
      return NextResponse.next();
    }
    const apiSession = await auth();
    const organizationId = apiSession?.user?.organizationId;
    if (organizationId && (await getOrgAccess(organizationId)) !== "full") return readOnlyResponse();
    return NextResponse.next();
  }

  const session = await auth();
  const isLoggedIn = !!session?.user;
  const role = session?.user?.role;
  const isEjecutivo = role === "ejecutivo";
  const isRestrictedUser = role === "user";

  // La landing no consulta la sesión (así no depende de ella para renderizar);
  // quien ya entró va directo a su panel desde aquí.
  if (path === "/" && isLoggedIn) {
    return NextResponse.redirect(new URL(isEjecutivo ? "/whatsapp/chat" : "/dashboard", req.url));
  }

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
