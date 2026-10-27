"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { CheckCheck, Search, Send } from "lucide-react";
import { MessengerIcon, WhatsAppIcon, InstagramIcon } from "@/app/components/ui/channel-icons";
import { WhatsAppReadTicks } from "@/app/components/ui/brand-marks";
import { BRAND_NAME } from "@/lib/brand";
import { cn } from "@/app/components/ui/cn";

// Maquetas alineadas al panel (bandeja, pipeline, automatizaciones).
// InboxMock es interactivo: tabs Bandeja/Hilo + cambio de chat.

type ThreadMsg = { from: "lead" | "bot" | "agent"; text: string; time: string; buttons?: string[] };

const CHATS: Array<{
  name: string;
  preview: string;
  time: string;
  unread: number;
  assignee: string | null;
  channel: string;
  messages: ThreadMsg[];
}> = [
  {
    name: "María Rodríguez",
    preview: "¿Cuánto cuesta el facial?",
    time: "Ahora",
    unread: 2,
    assignee: "Ana",
    channel: "WhatsApp",
    messages: [
      { from: "lead", text: "Hola, ¿cuánto cuesta el facial hidratante?", time: "10:42" },
      {
        from: "bot",
        text: "¡Hola María! El facial hidratante cuesta $850 y dura 60 min. ¿Te gustaría agendar?",
        time: "10:42",
        buttons: ["Agendar cita", "Ver otros servicios", "Hablar con alguien"],
      },
      { from: "lead", text: "Agendar cita", time: "10:43" },
      { from: "bot", text: "Listo: sábado 11:00. Te mando un recordatorio antes de tu cita.", time: "10:43" },
    ],
  },
  {
    name: "Daniela Flores",
    preview: "¿Tienen talla 25?",
    time: "2 m",
    unread: 0,
    assignee: null,
    channel: "Instagram",
    messages: [
      { from: "lead", text: "Hola, ¿tienen la 25 en negro?", time: "09:18" },
      { from: "agent", text: "Sí, en tienda y envío a CDMX. ¿Te la aparto?", time: "09:20" },
      { from: "lead", text: "Sí, por favor", time: "09:21" },
    ],
  },
  {
    name: "Jorge López",
    preview: "Mesa para 4 esta noche",
    time: "11 m",
    unread: 1,
    assignee: "Carlos",
    channel: "WhatsApp",
    messages: [
      { from: "lead", text: "Mesa para 4 esta noche, ¿hay lugar?", time: "12:05" },
      {
        from: "bot",
        text: "Tenemos 20:00 y 21:30. ¿Cuál prefieres?",
        time: "12:05",
        buttons: ["20:00", "21:30", "Hablar con alguien"],
      },
      { from: "lead", text: "20:00", time: "12:06" },
    ],
  },
  {
    name: "Ana Pérez",
    preview: "Depa en la Roma, ¿disponible?",
    time: "1 h",
    unread: 0,
    assignee: "Laura",
    channel: "Messenger",
    messages: [
      { from: "lead", text: "El depa en la Roma, ¿sigue disponible?", time: "Ayer" },
      { from: "agent", text: "Sí. ¿Te agendo visita mañana a las 17:00?", time: "Ayer" },
    ],
  },
  {
    name: "Roberto Díaz",
    preview: "Gracias, quedamos así",
    time: "Ayer",
    unread: 0,
    assignee: null,
    channel: "WhatsApp",
    messages: [
      { from: "lead", text: "Gracias, quedamos así", time: "Ayer" },
      { from: "agent", text: "Perfecto, aquí estamos si necesitas algo más.", time: "Ayer" },
    ],
  },
];

const PIPELINE = [
  {
    id: "NEW",
    title: "Nuevos",
    count: 3,
    header: "border-info-border bg-info-bg/40",
    dot: "bg-info",
    cards: [
      { name: "María Rodríguez", meta: "52155…4821", tag: "Facial", score: 72, label: "Oportunidad", unread: true },
      { name: "Luis Hernández", meta: "Chat web", tag: "Cotización", score: 38, label: "Frío", unread: false },
      { name: "Sofía Navarro", meta: "52181…2204", tag: "Promo", score: 55, label: "Interesado", unread: false },
    ],
  },
  {
    id: "CONTACTED",
    title: "Contactados",
    count: 3,
    header: "border-warning-border bg-warning-bg/40",
    dot: "bg-warning",
    cards: [
      { name: "Daniela Flores", meta: "Instagram", tag: "Tenis 25", score: 61, label: "Interesado", unread: false },
      { name: "Ana Pérez", meta: "Messenger", tag: "Visita", score: 84, label: "Prioridad", unread: true },
      { name: "Pedro Ruiz", meta: "Telegram", tag: "Seguimiento", score: 48, label: "Frío", unread: false },
    ],
  },
  {
    id: "QUALIFIED",
    title: "Calificados",
    count: 3,
    header: "border-accent-muted bg-accent-subtle",
    dot: "bg-accent",
    cards: [
      { name: "Jorge López", meta: "52133…9012", tag: "Reserva", score: 91, label: "Oportunidad", unread: false },
      { name: "Camila Ortiz", meta: "Chat web", tag: "Cierre", score: 88, label: "Prioridad", unread: true },
      { name: "Elena Vargas", meta: "WhatsApp", tag: "Pago", score: 76, label: "Oportunidad", unread: false },
    ],
  },
] as const;

const FLOW = [
  { title: "Mensaje recibido", detail: "WhatsApp · primera respuesta del contacto" },
  { title: "Menú de bienvenida", detail: "Botones: precios · agendar · hablar con alguien" },
  { title: "Califica el lead", detail: "IA · etiqueta «oportunidad» · score 78" },
  { title: "Pasa a humano", detail: "Asigna a Carlos · notificación al instante" },
] as const;

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2);
}

function MockAvatar({ name, channel, className }: { name: string; channel?: string; className?: string }) {
  const Mark = channel === "WhatsApp" ? WhatsAppIcon : channel === "Instagram" ? InstagramIcon : channel === "Messenger" ? MessengerIcon : null;
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-subtle text-[11px] font-semibold text-accent-ink">
        {initials(name)}
      </span>
      {Mark ? (
        <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-surface ring-2 ring-background">
          <Mark size={10} />
        </span>
      ) : null}
    </span>
  );
}

function Chrome({
  children,
  className,
  title,
  tabs,
}: {
  children: ReactNode;
  className?: string;
  title: string;
  tabs?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex h-full w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-border/80 bg-background shadow-[0_28px_70px_-32px_rgba(15,26,26,0.5)]",
        className
      )}
    >
      <div className="flex min-w-0 shrink-0 items-center gap-1.5 border-b border-border bg-surface px-2.5 py-2 min-[400px]:gap-2 min-[400px]:px-3">
        <span className="hidden h-2.5 w-2.5 shrink-0 rounded-full bg-border min-[360px]:inline-block" aria-hidden />
        <span className="hidden h-2.5 w-2.5 shrink-0 rounded-full bg-border min-[360px]:inline-block" aria-hidden />
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-border" aria-hidden />
        <span className="ml-1 min-w-0 flex-1 truncate text-[11px] font-medium text-muted-strong min-[400px]:ml-2">
          {BRAND_NAME} · {title}
        </span>
        {tabs ? <div className="ml-1 shrink-0 min-[400px]:ml-2">{tabs}</div> : null}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}

function ScoreBar({ score, label }: { score: number; label: string }) {
  const tone = score < 40 ? "bg-danger" : score < 70 ? "bg-warning" : "bg-success";
  const labelClass =
    label === "Frío"
      ? "bg-info-bg text-info"
      : label === "Interesado"
        ? "bg-warning-bg text-warning"
        : label === "Prioridad"
          ? "bg-danger-bg text-danger"
          : "bg-success-bg text-success";
  return (
    <div className="mt-2 flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-light">
        <div
          className={cn("landing-score-fill h-full rounded-full", tone)}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold", labelClass)}>{label}</span>
    </div>
  );
}

function ThreadPane({
  chat,
}: {
  chat: (typeof CHATS)[number];
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex items-center gap-2 border-b border-border bg-surface px-3 py-2.5">
        <MockAvatar name={chat.name} channel={chat.channel} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{chat.name}</p>
          <p className="truncate text-[11px] text-muted-darker">
            <span className="inline-flex items-center gap-1">
              {chat.channel === "WhatsApp" ? <WhatsAppIcon size={11} /> : chat.channel === "Instagram" ? <InstagramIcon size={11} /> : chat.channel === "Messenger" ? <MessengerIcon size={11} /> : null}
              {chat.channel}
              {chat.assignee ? ` · ${chat.assignee}` : ""}
            </span>
          </p>
        </div>
        <span className="ml-auto hidden rounded-md border border-accent-muted bg-accent-subtle px-2 py-1 text-[11px] font-semibold text-accent-ink sm:inline">
          {chat.assignee ? "Asignado" : "Sin asignar"}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden px-3 py-4 text-sm leading-relaxed">
        {chat.messages.map((m, i) => {
          const mine = m.from !== "lead";
          return (
            <div
              key={`${chat.name}-${i}`}
              className={cn(
                "landing-bubble max-w-[82%] rounded-2xl px-3.5 py-2.5 shadow-sm",
                mine
                  ? "self-end rounded-tr-sm bg-accent-muted text-foreground"
                  : "self-start rounded-tl-sm bg-surface text-foreground"
              )}
              style={{ "--landing-delay": `${80 + i * 110}ms` } as CSSProperties}
            >
              {m.text}
              {m.buttons ? (
                <div className="mt-2 space-y-1 border-t border-foreground/20 pt-2">
                  {m.buttons.map((label) => (
                    <p key={label} className="text-center text-xs font-medium text-accent-ink">
                      {label}
                    </p>
                  ))}
                </div>
              ) : null}
              <span
                className={cn(
                  "mt-1 flex items-center gap-1 text-[10px]",
                  mine ? "justify-end text-foreground/65" : "justify-end text-muted-darker"
                )}
              >
                {m.time}
                {mine ? (chat.channel === "WhatsApp" ? <WhatsAppReadTicks size={14} /> : <CheckCheck size={10} aria-hidden />) : null}
              </span>
            </div>
          );
        })}
      </div>

      <div className="border-t border-border bg-surface px-3 py-2.5">
        <div className="flex items-center gap-2 rounded-[12px] border border-border bg-background px-3 py-2">
          <span className="flex-1 text-xs text-muted-darker">Escribe un mensaje…</span>
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-on-accent">
            <Send size={14} aria-hidden />
          </span>
        </div>
      </div>
    </div>
  );
}

/** Bandeja + hilo (ancla del hero): tabs e hilos por chat. */
export function InboxMock({ className }: { className?: string }) {
  const [tab, setTab] = useState<"list" | "thread">("list");
  const [activeIdx, setActiveIdx] = useState(0);
  const active = CHATS[activeIdx] ?? CHATS[0];

  const tabs = (
    <div className="flex rounded-lg border border-border bg-background p-0.5 text-[10px] font-semibold min-[400px]:text-[11px]" role="tablist" aria-label="Vista del mock">
      {(
        [
          ["list", "Bandeja"],
          ["thread", "Hilo"],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={tab === id}
          className={cn(
            "rounded-md px-2 py-1 transition-colors min-[400px]:px-2.5",
            tab === id ? "bg-accent-subtle text-accent-ink" : "text-muted hover:text-foreground"
          )}
          onClick={() => setTab(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <Chrome className={className} title="Chats" tabs={tabs}>
      <div
        className={cn(
          "grid h-full min-h-0 flex-1 bg-surface",
          tab === "list" && "md:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] lg:grid-cols-[minmax(0,18.5rem)_minmax(0,1fr)]"
        )}
      >
        {tab === "list" ? (
          <aside className="flex h-full min-h-0 flex-col border-b border-border md:border-b-0 md:border-r">
            <div className="space-y-3 border-b border-border p-3">
              <p className="text-sm font-bold tracking-tight">Chats</p>
              <div className="flex h-9 items-center gap-2 rounded-[12px] border border-border bg-surface-light px-2.5">
                <Search size={14} className="shrink-0 text-muted-darker" aria-hidden />
                <span className="text-xs text-muted-darker">Buscar chat...</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 border-b border-border bg-surface/50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-darker">
              <span className="h-1.5 w-1.5 shrink-0 animate-pulse-live rounded-full bg-accent" />
              <WhatsAppIcon size={11} />
              Spa Aurora · WhatsApp
            </div>
            <ul className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {CHATS.map((c, i) => (
                <li key={c.name} className="flex min-h-0 flex-1">
                  <button
                    type="button"
                    className={cn(
                      "chat-list-row flex h-full w-full items-center border-b border-border px-3 py-2 text-left transition-colors hover:bg-surface-light/80",
                      i === activeIdx && "bg-surface-light"
                    )}
                    aria-current={i === activeIdx ? "true" : undefined}
                    onClick={() => {
                      setActiveIdx(i);
                      // En móvil el hilo es pantalla completa; en escritorio basta con seleccionar.
                      if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) {
                        setTab("thread");
                      }
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <MockAvatar name={c.name} channel={c.channel} className="mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{c.name}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-darker">{c.preview}</p>
                        {c.assignee ? (
                          <span className="mt-1 inline-flex rounded-md bg-info-bg px-1.5 py-0.5 text-[10px] font-semibold text-info">
                            {c.assignee}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="text-[10px] text-muted-darker">{c.time}</span>
                        {c.unread > 0 ? (
                          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-on-accent">
                            {c.unread}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        ) : null}

        {tab === "list" ? (
          <div className="hidden h-full min-h-0 md:block">
            <ThreadPane chat={active} />
          </div>
        ) : (
          <div className="h-full min-h-0">
            <ThreadPane chat={active} />
          </div>
        )}
      </div>
    </Chrome>
  );
}

/** Solo el hilo activo — para la sección de bandeja. */
export function ThreadMock({ className }: { className?: string }) {
  return (
    <Chrome className={className} title="Conversación">
      <div className="flex min-h-[300px] flex-col bg-background sm:min-h-[360px]">
        <div className="flex min-w-0 items-center gap-2 border-b border-border bg-surface px-3 py-2.5 sm:px-4 sm:py-3">
          <MockAvatar name="María Rodríguez" channel="WhatsApp" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">María Rodríguez</p>
            <p className="flex items-center gap-1 truncate text-[11px] text-muted-darker"><WhatsAppIcon size={11} /> WhatsApp · ventana abierta · Ana</p>
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            <span className="rounded-md bg-success-bg px-2 py-1 text-[11px] font-semibold text-success">Cita agendada</span>
            <span className="rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-strong">Bot en pausa</span>
          </div>
        </div>
        <div className="flex flex-1 flex-col justify-end gap-3 px-3 py-4 text-sm leading-relaxed sm:px-4 sm:py-5">
          <p className="landing-bubble self-center rounded-full bg-surface-light px-3 py-1 text-[11px] text-muted-strong" style={{ "--landing-delay": "60ms" } as CSSProperties}>
            Hoy
          </p>
          <p className="landing-bubble max-w-[85%] self-start rounded-2xl rounded-tl-sm bg-surface px-3 py-2.5 shadow-sm sm:max-w-[75%] sm:px-3.5" style={{ "--landing-delay": "140ms" } as CSSProperties}>
            Perfecto, ¿puedo pagar con transferencia?
          </p>
          <p className="landing-bubble max-w-[85%] self-end rounded-2xl rounded-tr-sm bg-accent-muted px-3 py-2.5 sm:max-w-[75%] sm:px-3.5" style={{ "--landing-delay": "260ms" } as CSSProperties}>
            Sí. Te paso los datos y confirmamos tu lugar en cuanto veamos el pago.
            <span className="mt-1 flex items-center justify-end gap-1 text-[10px] text-foreground/65">
              11:02 <WhatsAppReadTicks size={14} />
            </span>
          </p>
          <p className="landing-bubble max-w-[85%] self-start rounded-2xl rounded-tl-sm bg-surface px-3 py-2.5 shadow-sm sm:max-w-[75%] sm:px-3.5" style={{ "--landing-delay": "380ms" } as CSSProperties}>
            Va, ya lo mando.
          </p>
        </div>
        <div className="border-t border-border bg-surface px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="flex items-center gap-2 rounded-[12px] border border-border bg-background px-3 py-2 sm:py-2.5">
            <span className="min-w-0 flex-1 truncate text-sm text-muted-darker">Escribe un mensaje…</span>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-on-accent">
              <Send size={15} aria-hidden />
            </span>
          </div>
        </div>
      </div>
    </Chrome>
  );
}

function PipelineStageColumn({
  stage,
  className,
}: {
  stage: (typeof PIPELINE)[number];
  className?: string;
}) {
  return (
    <div className={cn("flex h-full min-h-0 min-w-0 flex-col rounded-xl bg-surface-light/50 p-2", className)}>
      <div className={cn("mb-2 flex shrink-0 items-center gap-2 rounded-lg border px-2.5 py-1.5", stage.header)}>
        <span className={cn("h-2 w-2 shrink-0 rounded-full", stage.dot)} />
        <span className="min-w-0 truncate text-xs font-semibold text-foreground">{stage.title}</span>
        <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-strong">{stage.count}</span>
      </div>
      <ul className="flex min-h-0 flex-1 flex-col gap-2">
        {stage.cards.map((card) => (
          <li key={card.name} className="shrink-0 rounded-xl border border-border bg-surface p-3 shadow-sm">
            <div className="flex items-start gap-2">
              <MockAvatar name={card.name} className="h-7 w-7 text-[10px]" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
                  {card.name}
                  {card.unread ? (
                    <span className="h-1.5 w-1.5 shrink-0 animate-pulse-live rounded-full bg-danger" />
                  ) : null}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-muted-darker">{card.meta}</p>
                <span className="mt-1.5 inline-flex rounded-md bg-surface-light px-1.5 py-0.5 text-[10px] font-medium text-muted-strong">
                  {card.tag}
                </span>
                <ScoreBar score={card.score} label={card.label} />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Pipeline con las etapas reales de /ventas. En móvil: una etapa a la vez. */
export function PipelineMock({ className }: { className?: string }) {
  const [stageIdx, setStageIdx] = useState(0);
  const stage = PIPELINE[stageIdx] ?? PIPELINE[0];

  return (
    <Chrome className={className} title="Ventas">
      <div className="shrink-0 border-b border-border bg-surface px-3 py-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-bold tracking-tight">Pipeline</p>
          <p className="text-[11px] text-muted-darker">9 leads · esta semana</p>
        </div>
        {/* Selector de etapa — solo móvil (en sm+ se ven las 3 columnas). */}
        <div
          className="mt-2.5 flex gap-1 sm:hidden"
          role="tablist"
          aria-label="Etapas del pipeline"
        >
          {PIPELINE.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={i === stageIdx}
              className={cn(
                "min-w-0 flex-1 truncate rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition-colors",
                i === stageIdx
                  ? "border-accent-strong bg-accent-subtle text-accent-ink"
                  : "border-border bg-background text-muted hover:text-foreground"
              )}
              onClick={() => setStageIdx(i)}
            >
              {s.title}
            </button>
          ))}
        </div>
      </div>

      {/* Móvil: una columna a ancho completo */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3 sm:hidden">
        <PipelineStageColumn stage={stage} className="min-h-0 flex-1" />
        <div className="mt-3 flex shrink-0 items-center justify-center gap-1.5" aria-hidden>
          {PIPELINE.map((s, i) => (
            <span
              key={s.id}
              className={cn("h-1.5 rounded-full transition-all", i === stageIdx ? "w-4 bg-accent-strong" : "w-1.5 bg-border")}
            />
          ))}
        </div>
      </div>

      {/* Escritorio / tablet: las 3 etapas, mismo alto */}
      <div className="hidden h-full min-h-0 flex-1 gap-3 overflow-hidden p-3 sm:grid sm:grid-cols-3">
        {PIPELINE.map((s) => (
          <PipelineStageColumn key={s.id} stage={s} />
        ))}
      </div>
    </Chrome>
  );
}

function FlowSteps() {
  const last = FLOW.length - 1;
  return (
    <ol className="flex h-full min-h-0 flex-col overflow-hidden bg-background px-4 py-4">
      {FLOW.map((step, i) => (
        <li key={step.title} className={cn("relative flex gap-3", i < last ? "min-h-0 flex-1" : "shrink-0")}>
          {i < last ? (
            <span className="landing-flow-line absolute bottom-0 left-[15px] top-8 w-px bg-accent-muted" />
          ) : null}
          <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-accent bg-surface text-[11px] font-bold tabular-nums text-accent-ink">
            {i + 1}
          </span>
          <div
            className="landing-bubble min-w-0 flex-1 self-start rounded-xl border border-border bg-surface px-3 py-2.5 shadow-sm"
            style={{ "--landing-delay": `${100 + i * 120}ms` } as CSSProperties}
          >
            <p className="text-sm font-semibold text-foreground">{step.title}</p>
            <p className="mt-0.5 text-xs text-muted">{step.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Lo que el contacto ve cuando corre el flujo — ocupa la columna derecha. */
function FlowPreview() {
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-surface px-3 py-2.5">
        <MockAvatar name="María Rodríguez" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">María Rodríguez</p>
          <p className="truncate text-[11px] text-muted-darker">WhatsApp · respuesta automática</p>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col justify-end gap-2.5 overflow-hidden px-3 py-4 text-sm">
        <p className="landing-bubble max-w-[85%] self-start rounded-2xl rounded-tl-sm bg-surface px-3.5 py-2.5 shadow-sm" style={{ "--landing-delay": "80ms" } as CSSProperties}>
          Hola, quiero información
        </p>
        <div className="landing-bubble max-w-[85%] self-end rounded-2xl rounded-tr-sm bg-accent-muted px-3.5 py-2.5" style={{ "--landing-delay": "200ms" } as CSSProperties}>
          ¡Hola! Soy el asistente de Spa Aurora. ¿En qué te ayudo?
          <div className="mt-2 space-y-1 border-t border-foreground/20 pt-2">
            {["Ver precios", "Agendar cita", "Hablar con alguien"].map((label) => (
              <p key={label} className="text-center text-xs font-medium text-accent-ink">
                {label}
              </p>
            ))}
          </div>
        </div>
      </div>
      <div className="shrink-0 border-t border-border bg-surface px-3 py-2.5">
        <div className="flex items-center gap-2 rounded-[12px] border border-border bg-background px-3 py-2">
          <span className="flex-1 text-xs text-muted-darker">Escribe un mensaje…</span>
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-on-accent">
            <Send size={14} aria-hidden />
          </span>
        </div>
      </div>
    </div>
  );
}

/** Flujo de automatización en nodos. En escritorio, el flujo y la vista del contacto llenan el mismo marco. */
export function AutomationMock({ className }: { className?: string }) {
  return (
    <Chrome className={className} title="Automatizaciones">
      <div className="flex shrink-0 items-baseline justify-between gap-2 border-b border-border bg-surface px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-sm font-bold tracking-tight">Bienvenida · publicada</p>
          <p className="text-[11px] text-muted-darker">Se dispara con el primer mensaje</p>
        </div>
        <span className="shrink-0 rounded-md bg-success-bg px-2 py-1 text-[11px] font-semibold text-success">Activa</span>
      </div>
      <div className="grid h-full min-h-0 flex-1 md:grid-cols-2">
        <FlowSteps />
        <div className="hidden h-full min-h-0 border-l border-border md:block">
          <FlowPreview />
        </div>
      </div>
    </Chrome>
  );
}
