"use client";

import { Radar } from "lucide-react";
import { BusinessNameProvider } from "@/app/components/ui/business-context";
import {
  LayoutDashboard,
  Settings,
  MessageSquare,
  Bot,
  Megaphone,
  Users,
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
} from "lucide-react";
import { InstagramIcon, MessengerIcon, TelegramIcon, WebchatIcon, WhatsAppIcon } from "@/app/components/ui/channel-icons";
import { MetaIcon } from "@/app/components/ui/brand-marks";
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
  sidebarCard = null,
  platformAdmin = false,
  channels,
  callingEnabled = false,
  hasWhatsapp = true,
  accountHues = null,
}: {
  children: React.ReactNode;
  businessName?: string | null;
  role: string;
  initialUser: ShellUser;
  callingEnabled?: boolean;
  /** La organización ya tiene un número de WhatsApp conectado. */
  hasWhatsapp?: boolean;
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
  channels?: { telegram: boolean; messenger: boolean; instagram: boolean; webchat: boolean };
}) {
  const isAdmin = role === "admin";
  const isEjecutivo = role === "ejecutivo";

  const NAV: (NavItem | NavGroup)[] = isEjecutivo
    ? [
        {
          title: "Mensajería",
          items: [
            { href: "/whatsapp/chat",      label: "Chats",           icon: MessageSquare },
            { href: "/whatsapp/contactos", label: "Contactos",       icon: Contact },
            { href: "/whatsapp/citas",     label: "Citas",           icon: CalendarClock },
          ],
        },
        {
          title: "Ajustes",
          items: [
            { href: "/configuracion",      label: "Configuración",   icon: Settings, exact: true },
            { href: "/ayuda",              label: "Ayuda",           icon: LifeBuoy, exact: true },
          ],
        },
      ]
    : [
        // Principal: el trabajo diario y las pocas herramientas que importan el
        // primer día (~8). Todo lo demás está a un clic en "Más herramientas";
        // ninguna función ni ruta se quitó. Sin WhatsApp conectado, "Conectar
        // WhatsApp" va arriba como entrada principal.
        {
          title: "Principal",
          items: [
            { href: "/dashboard",               label: "Panel",            icon: LayoutDashboard, exact: true },
            ...(isAdmin && !hasWhatsapp ? [{ href: "/whatsapp/cuentas" as const, label: "Conectar WhatsApp", icon: WhatsAppIcon as React.ElementType }] : []),
            { href: "/whatsapp/chat",           label: "Chats",            icon: MessageSquare },
            ...(isAdmin ? [{ href: "/whatsapp/contactos" as const, label: "Contactos", icon: Contact as React.ElementType }] : []),
            { href: "/ventas",                  label: "Embudo de ventas", icon: KanbanSquare, exact: true },
            { href: "/whatsapp/citas",          label: "Citas",            icon: CalendarClock },
          ],
        },
        {
          title: "Automatización",
          items: [
            ...(isAdmin ? [{ href: "/whatsapp/bots" as const, label: "Bots IA", icon: Bot as React.ElementType }] : []),
            { href: "/whatsapp/automatizaciones", label: "Automatizaciones", icon: Zap },
            { href: "/whatsapp/campanas",       label: "Campañas",         icon: Megaphone },
          ],
        },
        {
          title: "Más herramientas",
          collapsible: true,
          items: [
            { href: "/estadisticas",            label: "Estadísticas",     icon: BarChart3, exact: true },
            { href: "/whatsapp/calificadores",  label: "Calificadores de Leads", icon: Target },
            ...(isAdmin ? [{ href: "/whatsapp/monitores" as const, label: "Monitores IA", icon: Radar as React.ElementType }] : []),
            { href: "/whatsapp/secuencias",     label: "Secuencias",       icon: Workflow },
            // Plantillas y campañas son de la API de WhatsApp: el alcance va en la etiqueta.
            { href: "/whatsapp/plantillas",     label: "Plantillas",       icon: FileText },
            { href: "/whatsapp/cuentas",        label: "Cuentas WhatsApp", icon: WhatsAppIcon },
            // Los demás canales están disponibles por defecto; el operador
            // puede desactivarlos por organización desde /plataforma. Si están
            // desactivados (y no hay cuentas ya conectadas) no aparecen aquí.
            ...(channels?.messenger ? [{ href: "/messenger/cuentas" as const, label: "Cuentas Messenger", icon: MessengerIcon as React.ElementType }] : []),
            ...(channels?.instagram ? [{ href: "/instagram/cuentas" as const, label: "Cuentas Instagram", icon: InstagramIcon as React.ElementType }] : []),
            ...(channels?.telegram ? [{ href: "/telegram/cuentas" as const, label: "Cuentas Telegram", icon: TelegramIcon as React.ElementType }] : []),
            ...(channels?.webchat ? [{ href: "/webchat/cuentas" as const, label: "Cuentas Web", icon: WebchatIcon as React.ElementType }] : []),
            // Admin-only: credenciales de negocio sensibles (mandan datos
            // reales al ad account en producción), sin equivalente de
            // WAAccountShare — mismo criterio que Bots IA/Usuarios.
            ...(isAdmin ? [{ href: "/meta-ads" as const, label: "Meta Ads", icon: MetaIcon as React.ElementType }] : []),
            ...(isAdmin ? [{ href: "/usuarios" as const, label: "Usuarios", icon: Users as React.ElementType, exact: true }] : []),
          ],
        },
        {
          title: "Ajustes",
          items: [
            { href: "/configuracion",           label: "Configuración",    icon: Settings, exact: true },
            { href: "/ayuda",                   label: "Ayuda",            icon: LifeBuoy, exact: true },
          ],
        },
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
    <AppShell nav={NAV} mobileTabs={mobileTabs} accent="accent" collapsible brand={businessName || undefined} headerRight={<NotificationBell />} topBanner={topBanner} bottomActions={sidebarCard} initialUser={initialUser}>
      {children}
      <CallDock pollIncoming={callingEnabled} />
    </AppShell>
    </AccountHuesProvider>
    </BusinessNameProvider>
  );
}
