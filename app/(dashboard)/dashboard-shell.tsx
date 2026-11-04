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
} from "lucide-react";
import { InstagramIcon, MessengerIcon, TelegramIcon, WebchatIcon, WhatsAppIcon } from "@/app/components/ui/channel-icons";
import { MetaIcon } from "@/app/components/ui/brand-marks";
import { AppShell, type NavItem, type NavGroup } from "@/app/components/ui/app-shell";
import { NotificationBell } from "@/app/components/ui/notification-bell";
import { CallDock } from "@/app/components/whatsapp/call-dock";
import type { ShellUser } from "@/app/components/ui/user-dropdown";

export function DashboardShell({
  children,
  businessName,
  role,
  initialUser,
  topBanner,
  platformAdmin = false,
  channels,
  callingEnabled = false,
}: {
  children: React.ReactNode;
  businessName?: string | null;
  role: string;
  initialUser: ShellUser;
  callingEnabled?: boolean;
  topBanner?: React.ReactNode;
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
          ],
        },
      ]
    : [
        // "Principal" agrupa el trabajo diario y abre con Panel porque es la
        // pantalla de aterrizaje tras iniciar sesión — antes vivía en el
        // segundo grupo, así que el primer ítem del menú no era donde caías.
        {
          title: "Principal",
          items: [
            { href: "/dashboard",               label: "Panel",            icon: LayoutDashboard, exact: true },
            { href: "/whatsapp/chat",           label: "Bandeja de Chats", icon: MessageSquare },
            ...(isAdmin ? [{ href: "/whatsapp/contactos" as const, label: "Contactos", icon: Contact as React.ElementType }] : []),
            { href: "/estadisticas",            label: "Estadísticas",     icon: BarChart3, exact: true },
            { href: "/ventas",                  label: "Pipeline",         icon: KanbanSquare, exact: true },
            { href: "/whatsapp/citas",          label: "Citas",            icon: CalendarClock },
          ],
        },
        {
          title: "Automatización",
          items: [
            ...(isAdmin ? [{ href: "/whatsapp/bots" as const, label: "Bots IA", icon: Bot as React.ElementType }] : []),
            { href: "/whatsapp/calificadores",  label: "Calificadores de Leads", icon: Target },
            ...(isAdmin ? [{ href: "/whatsapp/monitores" as const, label: "Monitores IA", icon: Radar as React.ElementType }] : []),
            { href: "/whatsapp/automatizaciones", label: "Automatizaciones",    icon: Zap },
            { href: "/whatsapp/secuencias",     label: "Secuencias",            icon: Workflow },
          ],
        },
        // El alcance va en el título del grupo: plantillas y campañas son
        // features de la API de WhatsApp y no aplican a los demás canales.
        {
          title: "Difusión WhatsApp",
          items: [
            { href: "/whatsapp/plantillas",     label: "Plantillas",       icon: FileText },
            { href: "/whatsapp/campanas",       label: "Campañas Masivas", icon: Megaphone },
          ],
        },
        {
          title: "Canales",
          items: [
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
          ],
        },
        {
          title: "Ajustes",
          items: [
            ...(isAdmin
              ? [{ href: "/usuarios" as const,  label: "Usuarios",         icon: Users as React.ElementType, exact: true }]
              : []),
            { href: "/configuracion",           label: "Configuración",    icon: Settings, exact: true },
          ],
        },
      ];

  if (platformAdmin) {
    NAV.push({ title: "Plataforma", items: [{ href: "/plataforma", label: "Organizaciones", icon: Building2 }] });
  }

  return (
    <BusinessNameProvider name={businessName ?? null}>
    <AppShell nav={NAV} accent="accent" collapsible brand={businessName || undefined} headerRight={<NotificationBell />} topBanner={topBanner} initialUser={initialUser}>
      {children}
      <CallDock pollIncoming={callingEnabled} />
    </AppShell>
    </BusinessNameProvider>
  );
}
