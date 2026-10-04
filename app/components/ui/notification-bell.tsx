"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Bell, MessageSquare, Megaphone, Bot as BotIcon, DollarSign, Phone, CalendarClock, CalendarPlus, Plug, CreditCard } from "lucide-react";
import type { NotificationType } from "@prisma/client";
import { Dropdown } from "./dropdown";
import { cn } from "./cn";

interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
}

const TYPE_ICON: Record<NotificationItem["type"], React.ElementType> = {
  CHAT_MESSAGE: MessageSquare,
  CAMPAIGN_COMPLETED: Megaphone,
  CAMPAIGN_FAILED: Megaphone,
  BOT_ERROR: BotIcon,
  BUDGET_EXCEEDED: DollarSign,
  ACCOUNT_STATUS: Phone,
  APPOINTMENT_REMINDER: CalendarClock,
  APPOINTMENT_PROPOSED: CalendarPlus,
  INTEGRATION_ERROR: Plug,
  BILLING: CreditCard,
};

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}

export function NotificationBell() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp/notifications?limit=20");
      const data = await res.json();
      if (Array.isArray(data.items)) {
        setItems((prev) => {
          // Merge en lugar de reemplazo: con el dropdown abierto, reemplazar
          // el array completo cada 25s (aunque nada haya cambiado) causaba un
          // re-render/parpadeo del dropdown sin motivo.
          const items = data.items as NotificationItem[];
          const byId = new Map(items.map((n) => [n.id, n]));
          let changed = false;
          const merged = prev.map((n) => {
            const fresh = byId.get(n.id);
            if (fresh && (fresh.read !== n.read || fresh.title !== n.title || fresh.body !== n.body)) {
              changed = true;
              return fresh;
            }
            return n;
          });
          const known = new Set(prev.map((n) => n.id));
          const prepended = items.filter((n) => !known.has(n.id));
          if (prepended.length > 0) changed = true;
          return changed ? [...prepended, ...merged] : prev;
        });
      }
      if (typeof data.unreadCount === "number") setUnreadCount(data.unreadCount);
    } catch {
      // silent — notification polling should not surface errors to the user
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; fetchNotifications also used for manual refresh
    fetchNotifications();
  }, [fetchNotifications]);

  // Con la pestaña oculta no se consulta (cada pestaña abierta de cada agente
  // sumaba carga sin beneficio); al volver a ella se refresca de inmediato.
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState !== "hidden") fetchNotifications();
    }, 25000);
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchNotifications();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fetchNotifications]);

  async function handleItemClick(item: NotificationItem) {
    if (!item.read) {
      setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, read: true } : n)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
      fetch(`/api/whatsapp/notifications/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read: true }),
      }).catch(() => {});
    }
    setOpen(false);
    if (item.link) router.push(item.link);
  }

  async function handleMarkAllRead() {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    await fetch("/api/whatsapp/notifications/read-all", { method: "POST" }).catch(() => {});
  }

  return (
    <Dropdown
      open={open}
      onOpenChange={setOpen}
      align="right"
      menuLabel="Notificaciones"
      trigger={
        <button
          type="button"
          className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-darker transition-colors hover:bg-surface-light hover:text-foreground"
          aria-label={unreadCount > 0 ? `Notificaciones, ${unreadCount > 99 ? "más de 99" : unreadCount} sin leer` : "Notificaciones"}
        >
          <Bell size={18} aria-hidden="true" />
          {unreadCount > 0 && (
            <span aria-hidden="true" className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-on-accent">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      }
    >
      <div className="w-80">
        <div className="flex items-center justify-between px-3.5 py-2 border-b border-border">
          <span className="text-xs font-semibold text-muted-darker uppercase tracking-wider">Notificaciones</span>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleMarkAllRead(); }}
              className="text-xs text-accent-ink hover:underline"
            >
              Marcar todo como leído
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-3.5 py-6 text-center text-sm text-muted-darker">Sin notificaciones</p>
          ) : (
            items.map((item) => {
              const Icon = TYPE_ICON[item.type];
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleItemClick(item)}
                  className={cn(
                    "w-full flex items-start gap-2.5 px-3.5 py-2.5 text-left text-sm transition-colors hover:bg-surface-light",
                    !item.read && "bg-accent-subtle"
                  )}
                >
                  <Icon size={16} aria-hidden="true" className="text-muted-darker shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate", !item.read && "font-semibold text-foreground")}>
                      {item.title}
                    </p>
                    {item.body && (
                      <p className="text-xs text-muted-darker truncate mt-0.5">{item.body}</p>
                    )}
                    <p className="text-[10px] text-muted-darker mt-0.5">{formatRelative(item.createdAt)}</p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </Dropdown>
  );
}
