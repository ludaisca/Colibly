"use client";

import { usePoll } from "@/app/components/ui/use-poll";
import { useState, useCallback, useMemo, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  Bell, BellOff, CheckCheck, X, MessageSquare, ShieldAlert, Megaphone, Bot as BotIcon, DollarSign, PhoneCall,
  CalendarClock, CalendarPlus, Plug, CreditCard, UserCheck, TimerOff,
} from "lucide-react";
import type { NotificationType } from "@prisma/client";
import { Dropdown } from "./dropdown";
import { Drawer } from "./drawer";
import { Button } from "./button";
import { Segmented } from "./segmented";
import { EmptyState } from "./empty-state";
import { ChannelAvatar, type AvatarChannel } from "./channel-avatar";
import { RelativeTime, useMinuteNow } from "./relative-time";
import { useToast } from "./toast";
import { cn } from "./cn";
import { notificationGroup, type NotificationGroup } from "@/lib/notifications/present";
import { useRunOnChange } from "@/app/components/ui/use-run-on-change";

// Centro de notificaciones (patrón tomado de Factzi, 2026-11-01): en escritorio
// un panel anclado a la campana; en el teléfono una hoja que sube desde abajo
// y se cierra con ✕, tocando fuera o arrastrando hacia abajo. Lo leído vive en
// el servidor (se sincroniza entre dispositivos), no en localStorage.

interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
  /** Aviso de un chat: cuenta y canal para el avatar con insignia. */
  chat: { accountId: string; channel: AvatarChannel } | null;
}

type Tone = "neutral" | "success" | "danger" | "info" | "warning";

const TYPE: Record<NotificationType, { icon: React.ElementType; tone: Tone }> = {
  CHAT_MESSAGE: { icon: MessageSquare, tone: "info" },
  CHAT_ASSIGNED: { icon: UserCheck, tone: "info" },
  CAMPAIGN_COMPLETED: { icon: Megaphone, tone: "success" },
  CAMPAIGN_FAILED: { icon: Megaphone, tone: "danger" },
  BOT_ERROR: { icon: BotIcon, tone: "danger" },
  BUDGET_EXCEEDED: { icon: DollarSign, tone: "warning" },
  ACCOUNT_STATUS: { icon: ShieldAlert, tone: "warning" },
  APPOINTMENT_REMINDER: { icon: CalendarClock, tone: "info" },
  APPOINTMENT_PROPOSED: { icon: CalendarPlus, tone: "info" },
  INTEGRATION_ERROR: { icon: Plug, tone: "danger" },
  BILLING: { icon: CreditCard, tone: "warning" },
  WHATSAPP_CALL: { icon: PhoneCall, tone: "success" },
  SLA_BREACH: { icon: TimerOff, tone: "danger" },
};

const CHIP: Record<Tone, string> = {
  neutral: "bg-surface-light text-muted-darker",
  success: "bg-success-bg text-success",
  danger: "bg-danger-bg text-danger",
  info: "bg-info-bg text-info",
  warning: "bg-warning-bg text-warning",
};

const GROUP_ORDER: NotificationGroup[] = ["Hoy", "Ayer", "Anteriores"];

/** true desde 768 px (`md`): panel anclado; por debajo, hoja inferior. */
function useIsDesktop(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(min-width: 768px)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(min-width: 768px)").matches,
    () => true,
  );
}

/** Nombre del contacto de un aviso de chat (semilla de su figura). */
function contactOf(item: NotificationItem): string {
  return item.type === "CHAT_ASSIGNED" && item.body ? item.body : item.title;
}

function Row({ item, onOpen }: { item: NotificationItem; onOpen: (item: NotificationItem) => void }) {
  const { icon: Icon, tone } = TYPE[item.type] ?? { icon: Bell, tone: "neutral" as Tone };
  const unread = !item.read;
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={cn(
        "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-light md:px-5",
        unread && "bg-accent-subtle",
      )}
    >
      {item.chat ? (
        <ChannelAvatar id={item.chat.accountId} name={contactOf(item)} channel={item.chat.channel} size="md" className="mt-0.5" />
      ) : (
        <span className={cn("mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", CHIP[tone])}>
          <Icon size={18} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-3">
          <span className={cn("min-w-0 text-sm text-foreground", unread ? "font-semibold" : "font-medium")}>{item.title}</span>
          <RelativeTime value={item.createdAt} className="shrink-0 pt-0.5 text-micro text-muted-darker" />
        </span>
        {item.body && <span className="mt-0.5 line-clamp-3 text-sm leading-snug text-muted">{item.body}</span>}
      </span>
      {unread && <span aria-label="Sin leer" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent-strong" />}
    </button>
  );
}

function Panel({
  items,
  unreadCount,
  onOpen,
  onMarkAll,
  onClose,
  sheet,
}: {
  items: NotificationItem[];
  unreadCount: number;
  onOpen: (item: NotificationItem) => void;
  onMarkAll: () => void;
  onClose: () => void;
  sheet: boolean;
}) {
  const [tab, setTab] = useState<"all" | "unread">("all");
  const now = useMinuteNow();
  const visible = tab === "unread" ? items.filter((n) => !n.read) : items;
  const groups = useMemo(() => {
    if (now === null) return [{ label: null as NotificationGroup | null, items: visible }];
    const at = new Date(now);
    return GROUP_ORDER
      .map((label) => ({ label: label as NotificationGroup | null, items: visible.filter((n) => notificationGroup(n.createdAt, at) === label) }))
      .filter((g) => g.items.length > 0);
  }, [visible, now]);

  const tabs: { value: "all" | "unread"; label: string; count: number }[] = [
    { value: "all", label: "Todas", count: items.length },
    { value: "unread", label: "Sin leer", count: unreadCount },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-3 md:px-5 md:pt-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">Notificaciones</h2>
          <p className="mt-0.5 text-xs text-muted-darker">{unreadCount > 0 ? `${unreadCount} sin leer` : "Estás al día"}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" icon={CheckCheck} onClick={onMarkAll}>
              Marcar todo
            </Button>
          )}
          {sheet && (
            <Button variant="ghost" size="icon" icon={X} onClick={onClose} aria-label="Cerrar notificaciones" />
          )}
        </div>
      </div>

      <div className="px-4 pb-3 md:px-5">
        <Segmented
          label="Filtrar notificaciones"
          value={tab}
          onChange={setTab}
          options={tabs.map((t) => ({ value: t.value, label: `${t.label} ${t.count}` }))}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-border">
        {visible.length === 0 ? (
          <EmptyState
            className="px-6 py-8"
            icon={tab === "unread" ? BellOff : Bell}
            title={tab === "unread" ? "No tienes nada pendiente" : "Aún no hay notificaciones"}
            description="Aquí te avisamos de mensajes en tus chats, chats que te asignen, citas y lo que necesite tu atención."
          />
        ) : (
          groups.map((g) => (
            <section key={g.label ?? "todas"} aria-label={g.label ?? undefined}>
              {g.label && (
                <h3 className="sticky top-0 z-10 border-b border-border bg-surface px-4 py-2 text-micro font-semibold text-muted-darker md:px-5">
                  {g.label}
                </h3>
              )}
              <ul>
                {g.items.map((item) => (
                  <li key={item.id}><Row item={item} onOpen={onOpen} /></li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
      {sheet && <div aria-hidden="true" className="h-[env(safe-area-inset-bottom)] shrink-0" />}
    </div>
  );
}

export function NotificationBell() {
  const router = useRouter();
  const { info } = useToast();
  const isDesktop = useIsDesktop();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp/notifications?limit=30");
      const data = await res.json();
      if (Array.isArray(data.items)) {
        setItems((prev) => {
          // Merge en lugar de reemplazo: con el panel abierto, reemplazar el
          // array completo cada 25 s (aunque nada cambie) lo hacía parpadear.
          const fresh = data.items as NotificationItem[];
          const byId = new Map(fresh.map((n) => [n.id, n]));
          let changed = false;
          const merged = prev.map((n) => {
            const next = byId.get(n.id);
            if (next && (next.read !== n.read || next.title !== n.title || next.body !== n.body)) {
              changed = true;
              return next;
            }
            return n;
          });
          const known = new Set(prev.map((n) => n.id));
          const prepended = fresh.filter((n) => !known.has(n.id));
          if (prepended.length > 0) changed = true;
          return changed ? [...prepended, ...merged] : prev;
        });
      }
      if (typeof data.unreadCount === "number") setUnreadCount(data.unreadCount);
    } catch {
      // silencioso: el sondeo de la campana no debe mostrar errores
    }
  }, []);

  useRunOnChange(() => fetchNotifications(), [fetchNotifications]);

  // Con la pestaña oculta solo un latido mínimo cada ~100 s, para que la
  // disponibilidad (lib/users/availability.ts, 5 min sin latido = desconectado)
  // no marque como ausente a quien trabaja en otra pestaña. Al volver se
  // refresca de inmediato; si el usuario está inactivo, usePoll espacia.
  const pollBell = useCallback(async ({ hidden }: { hidden: boolean }) => {
    if (hidden) await fetch("/api/whatsapp/notifications?limit=1").catch(() => {});
    else await fetchNotifications();
  }, [fetchNotifications]);
  usePoll(pollBell, { intervalMs: 25_000, hiddenMs: 100_000, maxIntervalMs: 100_000, immediate: false });

  const changeOpen = useCallback((next: boolean) => {
    setOpen(next);
    // Al abrir se refresca: pudo llegar algo desde el último sondeo.
    if (next) void fetchNotifications();
  }, [fetchNotifications]);
  const close = useCallback(() => setOpen(false), []);

  function handleOpen(item: NotificationItem) {
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

  async function handleMarkAll() {
    const before = { items, unreadCount };
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    let ids: string[] = [];
    try {
      const res = await fetch("/api/whatsapp/notifications/read-all", { method: "POST" });
      ids = res.ok ? ((await res.json()).ids ?? []) : [];
    } catch {
      setItems(before.items);
      setUnreadCount(before.unreadCount);
      return;
    }
    if (ids.length === 0) return;
    info("Todo marcado como leído.", {
      action: {
        label: "Deshacer",
        onClick: () => {
          setItems(before.items);
          setUnreadCount(before.unreadCount);
          void fetch("/api/whatsapp/notifications/read-all", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids, read: false }),
          }).then(() => fetchNotifications()).catch(() => {});
        },
      },
    });
  }

  const label = unreadCount > 0 ? `Notificaciones, ${unreadCount} sin leer` : "Notificaciones";
  const bell = (props: { onClick?: () => void }) => (
    <button
      type="button"
      onClick={props.onClick}
      className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-darker transition-colors hover:bg-surface-light hover:text-foreground"
      aria-label={label}
    >
      <Bell size={18} />
      {unreadCount > 0 && (
        <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-micro font-semibold text-on-accent">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </button>
  );
  const panel = (sheet: boolean) => (
    <Panel items={items} unreadCount={unreadCount} onOpen={handleOpen} onMarkAll={() => void handleMarkAll()} onClose={close} sheet={sheet} />
  );

  if (isDesktop) {
    return (
      <Dropdown panel panelLabel="Notificaciones" open={open} onOpenChange={changeOpen} align="right" closeOnSelect={false} trigger={bell({})}>
        <div className="flex max-h-[min(36rem,calc(100svh-6rem))] w-[26rem] max-w-[calc(100vw-1.5rem)] flex-col">
          {panel(false)}
        </div>
      </Dropdown>
    );
  }

  return (
    <>
      {bell({ onClick: () => changeOpen(true) })}
      <Drawer open={open} onClose={close} side="bottom" srTitle="Notificaciones">
        {panel(true)}
      </Drawer>
    </>
  );
}
