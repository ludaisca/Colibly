"use client";

import { useSession } from "next-auth/react";
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
  Phone,
  Send,
  Target,
  KanbanSquare,
  MessageCircle,
  Camera,
  CalendarClock,
  Workflow,
  Globe,
} from "lucide-react";
// Meta (feedback loop de calificación de leads) usa el mismo ícono que
// Difusión WhatsApp para no introducir un cuarto ícono de "anuncios" — la
// etiqueta ya distingue el propósito.
import { AppShell, type NavItem, type NavGroup } from "@/app/components/ui/app-shell";
import { NotificationBell } from "@/app/components/ui/notification-bell";

export function DashboardShell({
  children,
  businessName,
}: {
  children: React.ReactNode;
  businessName?: string | null;
}) {
  const { data: session } = useSession();
  const role = session?.user?.role;
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
            { href: "/whatsapp/cuentas",        label: "Cuentas WhatsApp", icon: Phone },
            { href: "/messenger/cuentas",       label: "Cuentas Messenger", icon: MessageCircle },
            { href: "/instagram/cuentas",       label: "Cuentas Instagram", icon: Camera },
            { href: "/telegram/cuentas",        label: "Cuentas Telegram", icon: Send },
            { href: "/webchat/cuentas",         label: "Cuentas Web",     icon: Globe },
            // Admin-only: credenciales de negocio sensibles (mandan datos
            // reales al ad account en producción), sin equivalente de
            // WAAccountShare — mismo criterio que Bots IA/Usuarios.
            ...(isAdmin ? [{ href: "/meta-ads" as const, label: "Meta Ads", icon: Megaphone as React.ElementType }] : []),
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

  return (
    <AppShell nav={NAV} accent="accent" collapsible brand={businessName || undefined} headerRight={<NotificationBell />}>
      {children}
    </AppShell>
  );
}
