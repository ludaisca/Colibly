"use client";

import { Tooltip } from "./tooltip";
import React, { Suspense, useState, useEffect, useCallback } from "react";
import { disablePush } from "@/lib/notifications/push-client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Menu, LogOut, PanelLeftClose, PanelLeftOpen, MoreHorizontal, ChevronDown } from "lucide-react";
import { Drawer } from "./drawer";
import { ThemeToggle } from "@/app/components/theme-toggle";
import { UserDropdown } from "./user-dropdown";
import { RouteProgressBar } from "./route-progress-bar";
import { cn } from "./cn";
import { BRAND_NAME } from "@/lib/brand";
import { BrandMark } from "./logo";
import { CommandPalette } from "./command-palette";
import type { ShellUser } from "@/app/components/ui/user-dropdown";

export interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  exact?: boolean;
  /** Otras rutas que marcan este ítem como activo (p. ej. "Canales" cubre /whatsapp/cuentas, /telegram/cuentas…). */
  matchPrefixes?: string[];
  /** Contador junto a la etiqueta (p. ej. chats en espera), en warning. */
  badge?: number;
}

export interface NavGroup {
  title?: string;
  items: NavItem[];
  /** Grupo plegable (p. ej. "Más herramientas"): el estado se recuerda en localStorage y se abre solo si la ruta actual está dentro. */
  collapsible?: boolean;
  /** Abierto la primera vez, antes de que la persona elija. */
  defaultOpen?: boolean;
}

const NAV_MORE_KEY = "colibly:nav-more-open";

export interface AppShellProps {
  nav: (NavItem | NavGroup)[];
  /** Andén: accesos de la barra inferior en el celular (máx. 3; el cuarto es "Más", que abre el menú). */
  mobileTabs?: NavItem[];
  accent?: "accent" | "danger";
  bottomActions?: React.ReactNode;
  logoArea?: React.ReactNode;
  brand?: string;
  headerRight?: React.ReactNode;
  initialUser?: ShellUser;
  hideUserDropdown?: boolean;
  collapsible?: boolean;
  // Aviso de cuenta a todo lo ancho entre el header y el contenido (correo
  // sin verificar, estado del plan). Fuera de <main> para no alterar el
  // layout full-bleed del inbox.
  topBanner?: React.ReactNode;
  /** Ítems fijos al pie del menú (Configuración, Ayuda), debajo de bottomActions. */
  footerNav?: NavItem[];
  children: React.ReactNode;
}

function activeClass(accent: "accent" | "danger") {
  return accent === "accent"
    // Ítem activo: fondo --nav-active y texto de tinta, no un bloque negro.
    ? "bg-nav-active text-foreground"
    : "bg-danger text-surface";
}

function SidebarContent({
  nav,
  accent = "accent",
  bottomActions,
  footerNav,
  logoArea,
  brand = BRAND_NAME,
  collapsed,
  onClose,
}: Pick<AppShellProps, "nav" | "accent" | "bottomActions" | "brand" | "footerNav"> & {
  logoArea?: React.ReactNode;
  collapsed?: boolean;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  // Grupos plegables: abiertos si la persona los abrió (localStorage) o si la
  // página actual es de uno de sus items (así nunca se pierde dónde estás).
  const [moreOpen, setMoreOpen] = useState<boolean | null>(null);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(NAV_MORE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage no existe en el servidor
      setMoreOpen(stored === null ? null : stored === "true");
    } catch {
      setMoreOpen(null);
    }
  }, []);
  const toggleMore = (current: boolean) => {
    setMoreOpen(!current);
    try {
      localStorage.setItem(NAV_MORE_KEY, String(!current));
    } catch {
      /* sin localStorage: solo vale en esta pestaña */
    }
  };
  const isActiveItem = (item: NavItem) =>
    (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/"))
    || (item.matchPrefixes ?? []).some((prefix) => pathname === prefix || pathname.startsWith(prefix + "/"));

  const renderLink = (item: NavItem) => {
    const Icon = item.icon;
    const active = isActiveItem(item);
    const badge = item.badge && item.badge > 0 ? (item.badge > 99 ? "99+" : String(item.badge)) : null;

    const linkEl = (
      <Link
        href={item.href}
        onClick={onClose}
        aria-label={collapsed ? item.label : undefined}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center rounded-sm text-sm font-medium transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong",
          // Ítems de 30 px con íconos de 16 px (trazo 1.75).
          collapsed ? "justify-center w-9 h-9 mx-auto" : "h-[30px] gap-2.5 px-2.5",
          active
            ? activeClass(accent ?? "accent")
            : "text-muted hover:bg-surface-light hover:text-foreground"
        )}
      >
        <Icon size={16} strokeWidth={1.75} className="shrink-0" />
        {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
        {!collapsed && badge && (
          <span className="rounded-xs bg-warning-bg px-1.5 text-xs tabular-nums text-warning" aria-label={`${badge} en espera`}>{badge}</span>
        )}
      </Link>
    );

    return (
      <li key={item.href} className="relative w-full">
        {collapsed ? <Tooltip label={item.label} side="right">{linkEl}</Tooltip> : linkEl}
      </li>
    );
  };

  return (
    <div className={cn("flex flex-col h-full", collapsed ? "items-center px-2" : "")}>
      <div className={cn("shrink-0", collapsed ? "px-0 py-5" : "px-4 py-4")}>
        {logoArea ?? (
          <Link href="/dashboard" onClick={onClose} className="flex items-center gap-2">
            <BrandMark className="h-8 w-8" />
            {!collapsed && (
              <span className="text-base font-semibold tracking-tight whitespace-nowrap truncate">
                {brand}
              </span>
            )}
          </Link>
        )}
      </div>

      <nav className={cn("scrollbar-none w-full flex-1 overflow-y-auto overflow-x-hidden", collapsed ? "px-1" : "px-3")}>
        <div className="flex flex-col gap-4 w-full">
          {nav.map((groupOrItem, index) => {
            const isGroup = "items" in groupOrItem;
            if (isGroup) {
              const group = groupOrItem as NavGroup;
              if (group.items.length === 0) return null;
              if (group.collapsible) {
                const hasActive = group.items.some(isActiveItem);
                const open = hasActive || (moreOpen ?? group.defaultOpen ?? false);
                const regionId = `nav-group-${index}`;
                const label = group.title ?? "Más";
                return (
                  <div key={group.title || index} className="flex flex-col gap-1 w-full">
                    {collapsed ? (
                      <div className="mx-auto my-1 h-px w-8 bg-border/70" aria-hidden="true" />
                    ) : null}
                    {(() => { const toggle = (
                      <button
                        type="button"
                        aria-expanded={open}
                        aria-controls={regionId}
                        aria-label={collapsed ? label : undefined}
                        // Con una página del grupo abierta no se puede plegar: sería esconder dónde estás.
                        onClick={() => { if (!hasActive) toggleMore(open); }}
                        className={cn(
                          "flex items-center text-sm font-medium text-muted transition-colors duration-fast hover:bg-surface-light hover:text-foreground rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong",
                          collapsed ? "justify-center w-9 h-9 mx-auto" : "h-[30px] gap-2.5 px-2.5 w-full"
                        )}
                      >
                        <MoreHorizontal size={16} strokeWidth={1.75} className="shrink-0" aria-hidden />
                        {!collapsed && (
                          <>
                            <span className="flex-1 text-left">{label}</span>
                            <ChevronDown size={14} aria-hidden className={cn("shrink-0 transition-transform", open && "rotate-180")} />
                          </>
                        )}
                      </button>
                    ); return collapsed ? <Tooltip label={label} side="right">{toggle}</Tooltip> : toggle; })()}
                    <ul id={regionId} hidden={!open} className="flex flex-col gap-px w-full">
                      {group.items.map(renderLink)}
                    </ul>
                  </div>
                );
              }
              return (
                <div key={group.title || index} className="flex flex-col gap-1 w-full">
                  {collapsed && index > 0 && (
                    <div className="mx-auto my-1 h-px w-8 bg-border/70" aria-hidden="true" />
                  )}
                  {!collapsed && group.title && (
                    <div className="mb-0.5 px-2.5 text-xs font-medium text-subtle">
                      {group.title}
                    </div>
                  )}
                  <ul className="flex flex-col gap-px w-full">
                    {group.items.map(renderLink)}
                  </ul>
                </div>
              );
            } else {
              const item = groupOrItem as NavItem;
              return (
                <ul key={item.href} className="flex flex-col gap-0.5 w-full">
                  {renderLink(item)}
                </ul>
              );
            }
          })}
        </div>
      </nav>

      <div className={cn(
        "shrink-0 border-t border-border w-full",
        collapsed ? "px-1 pt-3 mt-1 pb-4" : "px-3 pt-3 mt-1 pb-4"
      )}>
        {!collapsed && bottomActions}
        {footerNav && footerNav.length > 0 && <ul className="mb-1 flex w-full flex-col gap-px">{footerNav.map(renderLink)}</ul>}
        <Tooltip label="Cerrar sesión" side="right"><button aria-label="Cerrar sesión"
          // redirect: false + navegación relativa: la URL absoluta que arma el
          // servidor usa el origen interno del contenedor (0.0.0.0:5000) y
          // mandaba al usuario fuera de la app tras cerrar sesión.
          onClick={async () => {
            // El navegador deja de recibir los avisos de esta cuenta.
                  await disablePush();
                  await signOut({ redirect: false });
            // Recarga completa a propósito: router.push conservaría en memoria
            // el árbol de React y la caché del cliente de la sesión cerrada.
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination
            window.location.href = "/login";
          }}
          className={cn(
            "flex items-center text-sm font-medium text-muted transition-colors duration-fast hover:bg-surface-light hover:text-danger rounded-sm",
            collapsed ? "justify-center w-9 h-9 mx-auto" : "h-[30px] gap-2.5 w-full px-2.5"
          )}
        >
          <LogOut size={16} strokeWidth={1.75} />
          {!collapsed && "Cerrar sesión"}
        </button></Tooltip>
      </div>
    </div>
  );
}

export function AppShell({
  nav,
  mobileTabs,
  accent = "accent",
  bottomActions,
  logoArea,
  brand,
  headerRight,
  initialUser,
  hideUserDropdown = false,
  collapsible = false,
  topBanner,
  footerNav,
  children,
}: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  // Chat is a dense, WhatsApp-Web-style inbox that manages its own internal
  // scrolling panes — the standard page chrome (p-8 padding) just eats space
  // it needs, so this route gets a full-bleed shell instead.
  const pathname = usePathname();
  // Chat necesita pantalla completa (paneles con scroll propio); el resto usa
  // todo el ancho con px-6.
  const segments = pathname.split("/").filter(Boolean);
  const immersive = pathname.startsWith("/whatsapp/chat");
  // Dentro de una conversación abierta la barra estorba al compositor.
  const inConversation = /^\/whatsapp\/chat\/[^/]+\/[^/]+/.test(pathname);
  const automationEditor =
    segments.length === 3 && segments[0] === "whatsapp" && segments[1] === "automatizaciones";
  const wideContent = immersive || automationEditor;

  useEffect(() => {
    if (!collapsible) return;
    const stored = localStorage.getItem("colibly:sidebar-collapsed");
    // Deliberately set state after mount: localStorage is unavailable during
    // SSR, so reading it during render would mismatch the server-rendered
    // markup. Reading it post-hydration in an effect is the correct fix here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored === "true") setCollapsed(true);
  }, [collapsible]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("colibly:sidebar-collapsed", String(next));
      return next;
    });
  }, []);

  return (
    // --sidebar-w: ancho real del menú (colapsado o no) para lo que se fija
    // abajo a la derecha de él, como la barra "Cambios sin guardar".
    <div
      className={cn("flex bg-background", immersive ? "h-svh" : "min-h-svh")}
      style={{ "--sidebar-w": collapsed ? "4rem" : "232px" } as React.CSSProperties}
    >
      <a
        href="#contenido-principal"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100001] focus:rounded-lg focus:bg-surface focus:px-4 focus:py-3 focus:text-foreground focus:shadow-lg"
      >
        Saltar al contenido principal
      </a>
      <Suspense fallback={null}>
        <RouteProgressBar />
      </Suspense>
      <aside
        className={cn(
          // Menú de 232 px sobre --background con filete a la derecha.
          "hidden md:flex sticky top-0 self-start h-svh overflow-hidden border-r border-border bg-background flex-col shrink-0 transition-[width] duration-200 motion-reduce:transition-none",
          collapsed ? "w-16" : "w-[232px]"
        )}
      >
        <SidebarContent
          nav={nav}
          accent={accent}
          bottomActions={bottomActions}
          footerNav={footerNav}
          logoArea={logoArea}
          brand={brand}
          collapsed={collapsed}
        />
      </aside>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} side="left" width="w-64">
        <SidebarContent
          nav={nav}
          accent={accent}
          bottomActions={bottomActions}
          footerNav={footerNav}
          logoArea={logoArea}
          brand={brand}
          onClose={() => setDrawerOpen(false)}
        />
      </Drawer>

      <div className="flex flex-1 flex-col min-w-0">
        {/* relative z-40: el backdrop-blur crea un stacking context que aplana
            el header (y sus dropdowns z-50) en una capa atómica — sin elevar el
            header completo, el contenido de <main> (posterior en el DOM) pinta
            encima de los menús de usuario/notificaciones y les roba los clicks. */}
        {/* Dentro de una conversación, en el teléfono, la cabecera del chat (con
            su flecha de volver) ocupa este lugar: como la barra inferior. */}
        <header className={cn("relative z-40 flex shrink-0 items-center gap-2 bg-background/80 px-3 py-1 backdrop-blur-sm sm:gap-3 sm:px-4 md:px-6", inConversation && "max-md:hidden")}>
          {/* 40 px de objetivo táctil (antes 22 px, el tamaño del ícono). */}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="-ml-2 grid h-10 w-10 shrink-0 place-items-center rounded-sm text-foreground transition-colors hover:bg-surface-light md:hidden"
            aria-label="Abrir menú"
          >
            <Menu size={22} aria-hidden />
          </button>

          {collapsible && (
            <Tooltip label={collapsed ? "Expandir menú" : "Colapsar menú"}><button
              onClick={toggleCollapsed}
              className="hidden md:flex text-muted-darker hover:text-foreground transition-colors p-1 rounded-md"
              aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
              aria-expanded={!collapsed}
            >
              {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </button></Tooltip>
          )}

          <div className="md:hidden flex-1 flex items-center">
            <Link href="/dashboard" className="flex items-center gap-1.5">
              <BrandMark className="h-7 w-7" />
              <span className="text-sm font-semibold tracking-tight">
                {BRAND_NAME}
              </span>
            </Link>
          </div>

          {/* Spacer: empuja los controles de la derecha al borde del header. */}
          <div className="hidden md:block flex-1" />

          <div className="flex items-center gap-1.5">
            <CommandPalette nav={footerNav ? [...nav, { items: footerNav }] : nav} />
            <ThemeToggle />
            {headerRight}
            {!hideUserDropdown && <UserDropdown initialUser={initialUser} />}
          </div>
        </header>

        {topBanner}

        <main
          id="contenido-principal"
          tabIndex={-1}
          className={cn(
            "flex-1 ",
            immersive ? "flex flex-col min-h-0 overflow-hidden" : "px-4 py-4 md:px-6 md:py-5",
            // En el teléfono la barra de accesos queda pegada abajo: el final de
            // la página deja su alto (56 px) + el área segura libres.
            !immersive && mobileTabs && mobileTabs.length > 0 && "max-md:pb-[calc(3.5rem+1rem+env(safe-area-inset-bottom,0px))]"
          )}
        >
          {/* Sin contenedor centrado de 6XL: listas y tablas a todo lo ancho
              (px-6); los formularios se limitan solos a max-w-3xl a la izquierda. */}
          {wideContent ? children : <div className="w-full min-w-0">{children}</div>}
        </main>

        {mobileTabs && mobileTabs.length > 0 && !inConversation && (
          <nav
            aria-label="Accesos rápidos"
            className="sticky bottom-0 z-30 grid shrink-0 border-t border-border bg-surface pb-[env(safe-area-inset-bottom,0px)] md:hidden"
            style={{ gridTemplateColumns: `repeat(${mobileTabs.slice(0, 3).length + 1}, minmax(0, 1fr))` }}
          >
            {mobileTabs.slice(0, 3).map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex flex-col items-center gap-0.5 py-2 text-micro font-medium transition-colors",
                    active ? "text-foreground" : "text-muted hover:text-foreground"
                  )}
                >
                  <span className={cn("flex h-7 w-12 items-center justify-center rounded-sm", active && "bg-nav-active text-foreground")}>
                    <Icon size={18} aria-hidden />
                  </span>
                  {item.label}
                </Link>
              );
            })}
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="flex flex-col items-center gap-0.5 py-2 text-micro font-medium text-muted transition-colors hover:text-foreground"
            >
              <span className="flex h-7 w-12 items-center justify-center rounded-sm"><MoreHorizontal size={18} aria-hidden /></span>
              Más
            </button>
          </nav>
        )}
      </div>
    </div>
  );
}
