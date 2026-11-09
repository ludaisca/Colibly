import { auth } from "@/lib/auth";
import { type NextRequest, NextResponse } from "next/server";
import { getOrgAccess, readOnlyResponse } from "@/lib/billing/gates";
import { requestHost } from "@/lib/request-host";
import { API_MAX_BODY_BYTES } from "@/lib/api/constants";

// /plataforma (panel del operador) no va en las listas de rol: su acceso lo
// decide PLATFORM_ADMIN_EMAILS en la página y en /api/plataforma (404 al resto).
const PROTECTED = ["/dashboard", "/configuracion", "/whatsapp", "/telegram", "/messenger", "/instagram", "/webchat", "/usuarios", "/estadisticas", "/ventas", "/meta-ads", "/plataforma"];
// Ojo: las tres comprobaciones de rol viven DENTRO del bloque PROTECTED — una
// ruta ausente de esa lista no solo pierde el redirect a /login con
// callbackUrl, se salta también EXECUTIVE_BLOCKED/USER_BLOCKED por completo.
// Cualquier sección nueva (un canal adicional, p. ej.) debe entrar en PROTECTED
// aunque el layout ya redirija a los no autenticados.
const EXECUTIVE_BLOCKED = ["/dashboard", "/estadisticas", "/whatsapp/bots", "/whatsapp/campanas", "/whatsapp/plantillas", "/usuarios", "/whatsapp/cuentas", "/telegram/cuentas", "/messenger/cuentas", "/instagram/cuentas", "/webchat/cuentas", "/configuracion/ia", "/configuracion/api", "/configuracion/plan", "/ventas", "/meta-ads", "/whatsapp/secuencias", "/whatsapp/automatizaciones", "/whatsapp/monitores"];
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
const USER_BLOCKED = ["/whatsapp/contactos", "/whatsapp/bots", "/whatsapp/monitores", "/configuracion/ia", "/configuracion/api", "/configuracion/plan", "/meta-ads"];
// /verificar-correo e /invitacion no van aquí: funcionan con o sin sesión.
const AUTH = ["/login", "/register", "/recuperar", "/restablecer"];
const APP_PUBLIC = [...AUTH, "/verificar-correo", "/invitacion"];
const EXCLUDE = ["/_next", "/favicon.ico"];

function configuredHost(value: string | undefined): string | null {
  if (!value) return null;
  try { return new URL(value).hostname.toLowerCase(); } catch { return null; }
}

function onOrigin(origin: string, req: NextRequest, path = req.nextUrl.pathname): URL {
  const url = new URL(origin);
  url.pathname = path;
  url.search = req.nextUrl.search;
  return url;
}

// Solo lectura (prueba vencida, impago tras la gracia, cancelada): la UI puede
// leer todo pero ninguna mutación de /api pasa, salvo lo necesario para salir
// de ese estado (pagar, cuenta, equipo, eliminar la organización) o para no
// molestar (notificaciones).
// Las rutas públicas (webhooks de Meta/Telegram, widget, API v1 con key) no
// traen sesión y siguen su curso: lo entrante se guarda igual, y los envíos
// tienen su propio candado en los emisores y en la API v1.
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const READ_ONLY_ALLOWED = ["/api/auth", "/api/billing", "/api/organizacion", "/api/plataforma", "/api/usuarios", "/api/whatsapp/notifications"];

export default async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;

  if (EXCLUDE.some((e) => path.startsWith(e))) {
    return NextResponse.next();
  }

  // API pública: cuerpo de 1 MB como máximo. Aquí se corta lo que declara un
  // Content-Length mayor sin que llegue al handler; lo que llega sin
  // Content-Length (chunked) lo mide enforceBodyLimit en lib/api/respond.ts.
  if (path.startsWith("/api/v1/") && Number(req.headers.get("content-length") ?? 0) > API_MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: { code: "payload_too_large", message: `El cuerpo supera el máximo de ${Math.round(API_MAX_BODY_BYTES / 1024)} KB` } },
      { status: 413 }
    );
  }

  // Un único despliegue puede recibir ambos FQDN. La raíz del sitio es la
  // landing de marketing; cuenta y panel viven en app.* con su propia sesión.
  // Sin SITE_URL/APP_URL distintas (DEV), / sirve la landing en el mismo host.
  const siteHost = configuredHost(process.env.SITE_URL);
  const appHost = configuredHost(process.env.APP_URL);
  const host = requestHost(req.headers, req.nextUrl.host);
  const splitDomains = !!siteHost && !!appHost && siteHost !== appHost;
  const isSiteHost = splitDomains && host === siteHost;
  const isAppHost = splitDomains && host === appHost;

  if (splitDomains && host === `www.${siteHost}`) {
    return NextResponse.redirect(onOrigin(process.env.SITE_URL!, req), 308);
  }
  // URLs antiguas de la beta / vista previa: siempre a la raíz del sitio.
  if (path === "/beta" || path === "/producto") {
    if (isAppHost) return NextResponse.redirect(onOrigin(process.env.SITE_URL!, req, "/"), 308);
    return NextResponse.redirect(new URL("/", req.url), 308);
  }
  if (isSiteHost) {
    if (path.startsWith("/api/") && path !== "/api/beta/solicitudes") {
      return NextResponse.redirect(onOrigin(process.env.APP_URL!, req), 308);
    }
    // La documentación de la API vive solo en app.* (una URL canónica).
    if (path === "/docs" || path.startsWith("/docs/")) {
      return NextResponse.redirect(onOrigin(process.env.APP_URL!, req), 308);
    }
    if (APP_PUBLIC.some((r) => path === r || path.startsWith(r + "/"))
      || PROTECTED.some((r) => path === r || path.startsWith(r + "/"))) {
      return NextResponse.redirect(onOrigin(process.env.APP_URL!, req), 308);
    }
  }
  if (isAppHost && ["/terminos", "/privacidad", "/precios", "/contacto", "/eliminar-datos", "/blog", "/guias"].some((r) => path === r || path.startsWith(r + "/"))) {
    return NextResponse.redirect(onOrigin(process.env.SITE_URL!, req), 308);
  }
  if (isAppHost && path === "/sitemap.xml") return NextResponse.redirect(onOrigin(process.env.SITE_URL!, req), 308);

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

  if (isAppHost && path === "/") {
    return NextResponse.redirect(new URL(isLoggedIn ? (isEjecutivo ? "/whatsapp/chat" : "/dashboard") : "/login", req.url));
  }

  // La landing no consulta la sesión (así no depende de ella para renderizar);
  // quien ya entró va directo a su panel desde aquí.
  if (path === "/" && isLoggedIn && !isSiteHost) {
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
