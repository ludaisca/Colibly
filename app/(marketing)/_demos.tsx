import type { ReactNode } from "react";
import { InstagramIcon, MessengerIcon, TelegramIcon, WebchatIcon, WhatsAppIcon } from "@/app/components/ui/channel-icons";
import { cn } from "@/app/components/ui/cn";

// Demos estáticas del panel Andén para la landing, con datos de ejemplo.
// Copian la forma del panel (fila con franja de cuenta, cifra de espera en
// celdas, ruta de la venta) sin importar sus componentes de cliente: aquí no
// hay reloj ni datos reales.

type Channel = "whatsapp" | "instagram" | "messenger" | "telegram" | "webchat";

const CHANNEL: Record<Channel, { label: string; Icon: (p: { size?: number; className?: string }) => ReactNode }> = {
  whatsapp: { label: "WhatsApp", Icon: WhatsAppIcon },
  instagram: { label: "Instagram", Icon: InstagramIcon },
  messenger: { label: "Messenger", Icon: MessengerIcon },
  telegram: { label: "Telegram", Icon: TelegramIcon },
  webchat: { label: "Chat web", Icon: WebchatIcon },
};

/** Cifra de espera como en el tablero: lámpara + celdas con línea de corte. */
export function WaitClock({ clock, spoken, lamp }: { clock: string; spoken: string; lamp?: "warning" | "danger" }) {
  const digit = lamp === "danger" ? "text-danger" : lamp === "warning" ? "text-warning" : "text-foreground";
  return (
    <span className="inline-flex shrink-0 items-center gap-[3px]">
      <span aria-hidden className={cn("mr-0.5 h-6 w-[5px] rounded-sm", lamp === "danger" ? "bg-danger" : lamp === "warning" ? "bg-warning" : "bg-transparent")} />
      <span className="sr-only">{spoken}</span>
      {clock.split("").map((c, i) =>
        c === ":" ? (
          <span key={i} aria-hidden className={cn("font-display text-base font-bold leading-none", digit)}>:</span>
        ) : (
          <span
            key={i}
            aria-hidden
            className={cn(
              "relative inline-flex h-6 min-w-4 items-center justify-center rounded-[3px] bg-cell px-[3px] font-display text-base font-bold leading-none tabular-nums after:absolute after:inset-x-0 after:top-1/2 after:h-px after:bg-foreground/10",
              digit
            )}
          >
            {c}
          </span>
        )
      )}
    </span>
  );
}

const WAITING: { name: string; initials: string; channel: Channel; hue: number; message: string; clock: string; spoken: string; lamp?: "warning" | "danger" }[] = [
  { name: "Jorge López", initials: "JL", channel: "messenger", hue: 5, message: "¿Tienen mesa para 4 esta noche?", clock: "1:04", spoken: "Espera 1 h 4 min", lamp: "danger" },
  { name: "Daniela Flores", initials: "DF", channel: "instagram", hue: 7, message: "¿Tienen los tenis en talla 25?", clock: "0:18", spoken: "Espera 18 min", lamp: "warning" },
  { name: "Ana Pérez", initials: "AP", channel: "webchat", hue: 3, message: "¿El depa en la Roma sigue disponible?", clock: "0:06", spoken: "Espera 6 min" },
  { name: "María Rodríguez", initials: "MR", channel: "whatsapp", hue: 4, message: "Sí, el sábado en la mañana", clock: "0:01", spoken: "Espera 1 min" },
];

/** Lista "Esperando" de la bandeja, ordenada por espera. */
export function DemoInbox() {
  return (
    <div className="rounded-xl bg-surface-light p-3 sm:p-4">
      <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
        <p className="font-display text-xl font-bold">Esperando</p>
        <p className="text-xs text-muted-darker">Ordenados por espera</p>
      </div>
      <ul className="flex flex-col gap-1.5" aria-label="Chats de ejemplo esperando respuesta">
        {WAITING.map((c) => {
          const { label, Icon } = CHANNEL[c.channel];
          return (
            <li
              key={c.name}
              className={cn(`hue-${c.hue}`, "relative flex items-center gap-3 overflow-hidden rounded-lg border border-border bg-surface py-2.5 pl-4 pr-3")}
            >
              <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-entity" />
              <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-entity-bg text-sm font-semibold">
                {c.initials}
                <span className="absolute -bottom-0.5 -right-0.5 grid h-[18px] w-[18px] place-items-center rounded-full bg-surface">
                  <Icon size={13} />
                </span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold">{c.name}</span>
                <span className="block truncate text-sm text-muted">
                  <span className="sr-only">{label}: </span>
                  {c.message}
                </span>
              </span>
              <WaitClock clock={c.clock} spoken={c.spoken} lamp={c.lamp} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Los cinco canales, en una línea. */
export function ChannelRow({ className }: { className?: string }) {
  return (
    <ul className={cn("flex flex-wrap gap-x-4 gap-y-2", className)} aria-label="Canales">
      {(Object.keys(CHANNEL) as Channel[]).map((k) => {
        const { label, Icon } = CHANNEL[k];
        return (
          <li key={k} className="inline-flex items-center gap-1.5 text-sm font-medium">
            <Icon size={16} />
            {label}
          </li>
        );
      })}
    </ul>
  );
}

const STATIONS = ["Nuevo", "Contactado", "Calificado", "Cliente"] as const;

/** Ruta de la venta con el chat de María en "Calificado". */
export function DemoRoute() {
  const current = 2;
  return (
    <div className="hue-4 rounded-xl bg-surface-light p-4 sm:p-5">
      <ol className="relative flex flex-col gap-5" aria-label="Ruta de la venta de ejemplo">
        <span aria-hidden className="absolute bottom-3 left-[9px] top-3 w-1 rounded-full bg-border" />
        <span aria-hidden className="absolute left-[9px] top-3 h-[calc(50%+0.5rem)] w-1 rounded-full bg-entity" />
        {STATIONS.map((s, i) => {
          const done = i < current;
          const here = i === current;
          return (
            <li key={s} className="relative flex items-start gap-4" aria-current={here ? "step" : undefined}>
              <span
                aria-hidden
                className={cn(
                  "relative z-10 mt-0.5 shrink-0 rounded-full",
                  here
                    ? "h-[22px] w-[22px] border-4 border-foreground bg-entity shadow-[inset_0_0_0_3px_var(--surface)]"
                    : done
                      ? "ml-[1px] h-5 w-5 border-4 border-entity bg-surface"
                      : "ml-[1px] h-5 w-5 border-4 border-border bg-surface"
                )}
              />
              <div className="min-w-0 flex-1">
                <p className={cn("font-display text-lg font-bold uppercase tracking-[0.02em]", !done && !here && "text-muted-darker")}>{s}</p>
                {here && (
                  <div className="mt-2 rounded-xl border border-border bg-surface p-3">
                    <p className="flex items-center gap-2 text-[15px] font-semibold">
                      <WhatsAppIcon size={15} />
                      María Rodríguez
                    </p>
                    <p className="mt-1 text-sm text-muted">Facial hidratante · $850</p>
                    <p className="mt-2 inline-flex rounded-full border border-border bg-surface-light px-2 py-0.5 text-xs font-medium">
                      Cita: sábado 11:00 con Ana
                    </p>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
