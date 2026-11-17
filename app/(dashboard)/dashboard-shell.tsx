"use client";

import { Radar } from "lucide-react";
import { BusinessNameProvider } from "@/app/components/ui/business-context";
import {
  LayoutDashboard,
  Settings,
  MessageSquare,
  Bot,
  Megaphone,
  BarChart3,
  FileText,
  Contact,
  Target,
  KanbanSquare,
  CalendarClock,
  Workflow,
  Zap,
  Building2,
  LifeBuoy,
  Cable,
} from "lucide-react";
import { ChannelFlagsProvider } from "@/app/components/ui/channel-flags";
import { AppShell, type NavItem, type NavGroup } from "@/app/components/ui/app-shell";
import { NotificationBell } from "@/app/components/ui/notification-bell";
import { CallDock } from "@/app/components/whatsapp/call-dock";
import type { ShellUser } from "@/app/components/ui/user-dropdown";
import { AccountHuesProvider } from "@/app/components/ui/account-hues";
import type { AccountHues } from "@/app/components/ui/hue";

export function DashboardShell({
  children,
  businessName,
  role,
  initialUser,
  topBanner,
  platformAdmin = false,
  channels,
  callingEnabled = false,
  accountHues = null,
  waitingChats = 0,
  sidebarCard = null,
}: {
  children: React.ReactNode;
  businessName?: string | null;
  role: string;
  initialUser: ShellUser;
  callingEnabled?: boolean;
  /** Chats esperando respuesta (contador en warning junto a "Chats"). */
  waitingChats?: number;
  /** Tono de cada cuenta en la organización, sin choques (lib/accounts/hues.ts). */
  accountHues?: AccountHues | null;
  topBanner?: React.ReactNode;
  /** Tarjeta al pie del menú (días de prueba); en el celular sale en "Más". */
  sidebarCard?: React.ReactNode;
  // Operador de la plataforma (PLATFORM_ADMIN_EMAILS): ve el grupo "Plataforma".
  platformAdmin?: boolean;
  // Canales adicionales a WhatsApp. Están disponibles por defecto; el
  // operador puede desactivarlos desde /plataforma (ver lib/channel-flags.ts).
  // Un canal desactivado no aparece en el nav (a menos que la organización ya
  // tuviera cuentas ahí).
  channels?: { telegram: boolean; messenger: boolean; instagram: boolean; webchat: boolean; whatsappWeb: boolean };
}) {
  const isAdmin = role === "admin";
  const isEjecutivo = role === "ejecutivo";

  // Menú por tarea (dirección congelada, nov 2026). Las rutas no cambian;
  // los canales son una sola entrada ("Canales") con pestañas por canal, y
  // Usuarios / Meta Ads viven en el menú de usuario (admins).
  const chats: NavItem = { href: "/whatsapp/chat", label: "Chats", icon: MessageSquare, badge: waitingChats };
  const NAV: (NavItem | NavGroup)[] = isEjecutivo
    ? [
        {
          title: "Bandeja",
          items: [
            chats,
            { href: "/whatsapp/contactos", label: "Contactos", icon: Contact },
            { href: "/whatsapp/citas",     label: "Citas",     icon: CalendarClock },
          ],
        },
      ]
    : [
        { items: [{ href: "/dashboard", label: "Panel", icon: LayoutDashboard, exact: true }] },
        {
          title: "Bandeja",
          items: [
            chats,
            ...(isAdmin ? [{ href: "/whatsapp/contactos" as const, label: "Contactos", icon: Contact as React.ElementType }] : []),
            { href: "/whatsapp/citas", label: "Citas", icon: CalendarClock },
          ],
        },
        {
          title: "Ventas",
          items: [
            { href: "/ventas",            label: "Embudo",    icon: KanbanSquare, exact: true },
            { href: "/whatsapp/campanas", label: "Campañas",  icon: Megaphone },
          ],
        },
        {
          title: "Automatización",
          items: [
            ...(isAdmin ? [{ href: "/whatsapp/bots" as const, label: "Bots IA", icon: Bot as React.ElementType }] : []),
            { href: "/whatsapp/automatizaciones", label: "Automatizaciones", icon: Zap },
            { href: "/whatsapp/secuencias",       label: "Secuencias",       icon: Workflow },
            // Plantillas y campañas son de la API de WhatsApp (Meta).
            { href: "/whatsapp/plantillas",       label: "Plantillas",       icon: FileText },
          ],
        },
        {
          title: "Reportes",
          items: [
            { href: "/estadisticas",           label: "Estadísticas",  icon: BarChart3, exact: false },
            { href: "/whatsapp/calificadores", label: "Calificadores", icon: Target },
            ...(isAdmin ? [{ href: "/whatsapp/monitores" as const, label: "Monitores", icon: Radar as React.ElementType }] : []),
          ],
        },
        {
          items: [
            {
              href: "/canales",
              label: "Canales",
              icon: Cable,
              matchPrefixes: ["/whatsapp/cuentas", "/messenger/cuentas", "/instagram/cuentas", "/telegram/cuentas", "/webchat/cuentas", "/whatsapp-web/cuentas"],
            },
          ],
        },
      ];

  // Pie del menú: Configuración y Ayuda (la tarjeta de prueba va encima).
  const footerNav: NavItem[] = [
    { href: "/configuracion", label: "Configuración", icon: Settings, exact: true },
    { href: "/ayuda",         label: "Ayuda",         icon: LifeBuoy, exact: true },
  ];

  if (platformAdmin) {
    NAV.push({ title: "Plataforma", items: [{ href: "/plataforma", label: "Organizaciones", icon: Building2 }] });
  }

  // Barra inferior del celular (Andén): los tres primeros accesos que este rol
  // tiene, en este orden; "Más" abre el menú completo.
  const navItems = NAV.flatMap((entry) => ("items" in entry ? entry.items : [entry]));
  const mobileTabs = ["/whatsapp/chat", "/whatsapp/contactos", "/ventas", "/whatsapp/citas"]
    .map((href) => navItems.find((item) => item.href === href))
    .filter((item): item is NavItem => !!item)
    .slice(0, 3)
    .map((item) => (item.href === "/whatsapp/chat" ? { ...item, label: "Chats" } : item.href === "/ventas" ? { ...item, label: "Embudo" } : item));

  return (
    <BusinessNameProvider name={businessName ?? null}>
    <AccountHuesProvider hues={accountHues}>
    <ChannelFlagsProvider flags={channels ?? null}>
    <AppShell nav={NAV} mobileTabs={mobileTabs} accent="accent" collapsible brand={businessName || undefined} headerRight={<NotificationBell />} topBanner={topBanner} bottomActions={sidebarCard} footerNav={footerNav} initialUser={{ ...initialUser, isAdmin }}>
      {children}
      <CallDock pollIncoming={callingEnabled} />
    </AppShell>
    </ChannelFlagsProvider>
    </AccountHuesProvider>
    </BusinessNameProvider>
  );
}
