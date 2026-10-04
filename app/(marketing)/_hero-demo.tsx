"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, LazyMotion, MotionConfig, domAnimation } from "motion/react";
import * as m from "motion/react-m";
import { Pause, Play, Sparkles } from "lucide-react";
import { cn } from "@/app/components/ui/cn";

// Demostración del hero: una conversación real por giro que se reproduce sola.
// El texto del hero queda fijo a la izquierda; esto es lo único que se mueve.
// Accesibilidad (patrón de carrusel): pestañas por giro y botón de pausa; con el
// mouse encima o el foco dentro no cambia sola de escenario (el que se ve
// termina de reproducirse), fuera de pantalla se detiene y con "reducir
// movimiento" cada escenario se muestra completo y no rota solo.

type Tone = "danger" | "success" | "accent" | "info";

type Item =
  | { kind: "client"; text: string }
  | { kind: "bot"; text: string }
  | { kind: "buttons"; options: string[]; pick: number };

interface Scenario {
  id: string;
  label: string;
  contact: { name: string; initials: string; channel: string };
  items: Item[];
  outcome: { text: string; tone: Tone };
  status: string;
}

const SCENARIOS: Scenario[] = [
  {
    id: "spa",
    label: "Spa",
    contact: { name: "María Rodríguez", initials: "MR", channel: "WhatsApp · Lead de anuncio" },
    items: [
      { kind: "client", text: "Hola, ¿cuánto cuesta el facial hidratante?" },
      { kind: "bot", text: "¡Hola María! El facial hidratante cuesta $850 y dura 60 min. ¿Te gustaría agendar?" },
      { kind: "buttons", options: ["Agendar cita", "Ver otros servicios", "Hablar con alguien"], pick: 0 },
      { kind: "bot", text: "Listo, te aparté el sábado a las 11:00. Te llegará un recordatorio antes de tu cita." },
    ],
    outcome: { text: "Cita agendada", tone: "success" },
    status: "Respondido y agendado por tu bot de IA",
  },
  {
    id: "tienda",
    label: "Tienda",
    contact: { name: "Daniela Flores", initials: "DF", channel: "Instagram · Mensaje directo" },
    items: [
      { kind: "client", text: "¿Tienen estos tenis en talla 25?" },
      { kind: "bot", text: "Sí, nos quedan 3 pares en talla 25. Cuestan $1,290 con envío gratis. ¿Te los aparto?" },
      { kind: "buttons", options: ["Sí, apártalos", "Ver otros colores"], pick: 0 },
      { kind: "bot", text: "¡Hecho! Un asesor te escribe en unos minutos para confirmar tu pago." },
    ],
    outcome: { text: "Oportunidad", tone: "info" },
    status: "Asignado a Carlos · Ventas",
  },
  {
    id: "restaurante",
    label: "Restaurante",
    contact: { name: "Jorge López", initials: "JL", channel: "WhatsApp" },
    items: [
      { kind: "client", text: "Hola, ¿tienen mesa para 4 hoy en la noche?" },
      { kind: "bot", text: "¡Hola Jorge! Con gusto te ayudo. ¿Qué necesitas?" },
      { kind: "buttons", options: ["Reservar mesa", "Ver menú", "Ubicación y horario"], pick: 0 },
      { kind: "bot", text: "Tenemos mesa para 4 a las 20:30. Quedó a tu nombre, ¡te esperamos!" },
    ],
    outcome: { text: "Reservación", tone: "accent" },
    status: "Automatización: menú de bienvenida",
  },
  {
    id: "inmobiliaria",
    label: "Inmobiliaria",
    contact: { name: "Ana Pérez", initials: "AP", channel: "Messenger · Lead de anuncio" },
    items: [
      { kind: "client", text: "Me interesa el depa de la colonia Roma. ¿Sigue disponible?" },
      { kind: "bot", text: "Sí: 2 recámaras, $18,500 al mes. ¿Para cuándo te quieres mudar y cuál es tu presupuesto?" },
      { kind: "client", text: "Para el próximo mes, tengo hasta $20,000." },
      { kind: "bot", text: "¡Perfecto! Laura, nuestra asesora, te escribe hoy para agendar la visita." },
    ],
    outcome: { text: "Prioridad alta", tone: "danger" },
    status: "Calificado por IA · Asignado a Laura",
  },
];

const TONE: Record<Tone, string> = {
  danger: "border-danger-border bg-danger-bg text-danger",
  success: "border-success-border bg-success-bg text-success",
  accent: "border-accent-muted bg-accent-subtle text-accent-ink",
  info: "border-info-border bg-info-bg text-info",
};

// Pasos de la reproducción: cada mensaje, la selección de un botón (que se
// convierte en mensaje del cliente) y al final la etiqueta del resultado.
type Beat = { type: "item"; index: number } | { type: "pick"; index: number } | { type: "outcome" };

function beatsFor(s: Scenario): Beat[] {
  const beats: Beat[] = [];
  s.items.forEach((it, index) => {
    beats.push({ type: "item", index });
    if (it.kind === "buttons") beats.push({ type: "pick", index });
  });
  beats.push({ type: "outcome" });
  return beats;
}

// Espera antes de mostrar cada paso: los del bot llevan "escribiendo…".
function delayFor(s: Scenario, beat: Beat): number {
  if (beat.type === "outcome") return 900;
  if (beat.type === "pick") return 1100;
  const it = s.items[beat.index];
  if (it.kind === "bot") return 1500;
  if (it.kind === "buttons") return 500;
  return 700;
}

const HOLD_MS = 2600;

// Preferencia de "reducir movimiento". No se usa useReducedMotion de Motion
// porque lee el valor del navegador en el primer render y el servidor no lo
// conoce: el HTML no coincidía (el botón de pausa sí/no) y React rehacía el
// árbol. Con useSyncExternalStore la hidratación usa el valor del servidor
// (false) y después se actualiza sin error.
const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";
function subscribeReduced(onChange: () => void) {
  const mq = window.matchMedia(REDUCED_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReduced, () => window.matchMedia(REDUCED_QUERY).matches, () => false);
}
const bubbleMotion = {
  initial: { opacity: 0, y: 8, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  transition: { duration: 0.28, ease: [0.4, 0, 0.2, 1] as const },
};

export function HeroDemo() {
  const reduce = usePrefersReducedMotion();
  const [active, setActive] = useState(0);
  // El primer escenario llega completo desde el servidor: sin tarjeta vacía ni
  // saltos de layout mientras carga la página.
  const [shown, setShown] = useState(() => beatsFor(SCENARIOS[0]).length);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [inView, setInView] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const baseId = useId();

  const scenario = SCENARIOS[active];
  const beats = beatsFor(scenario);
  // `playing`: avanzan los mensajes del escenario visible. `rotating`: además
  // pasa solo al siguiente. Separados para que elegir una pestaña (mouse encima,
  // foco dentro) reproduzca esa conversación en vez de dejarla vacía.
  const playing = !reduce && !paused && inView;
  const rotating = playing && !hovered && !focused;

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const done = shown >= beats.length;
    if (!playing || (done && !rotating)) return;
    const t = window.setTimeout(
      () => {
        if (done) {
          setActive((a) => (a + 1) % SCENARIOS.length);
          setShown(0);
        } else {
          setShown((n) => n + 1);
        }
      },
      done ? HOLD_MS : delayFor(scenario, beats[shown])
    );
    return () => window.clearTimeout(t);
  }, [playing, rotating, shown, beats, scenario]);

  const goTo = useCallback(
    (index: number) => {
      const next = (index + SCENARIOS.length) % SCENARIOS.length;
      setActive(next);
      // Con movimiento reducido (o en pausa) se muestra completo al instante.
      setShown(reduce || paused ? beatsFor(SCENARIOS[next]).length : 0);
    },
    [reduce, paused]
  );

  const visible = beats.slice(0, shown);
  const picked = new Set(visible.filter((b): b is Extract<Beat, { type: "pick" }> => b.type === "pick").map((b) => b.index));
  const nextBeat = beats[shown];
  const typing = playing && nextBeat?.type === "item" && scenario.items[nextBeat.index].kind === "bot";
  const showOutcome = visible.some((b) => b.type === "outcome");

  function onTabKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const next = (active + (e.key === "ArrowRight" ? 1 : -1) + SCENARIOS.length) % SCENARIOS.length;
      goTo(next);
      document.getElementById(`${baseId}-tab-${next}`)?.focus();
    }
  }

  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <div
          ref={rootRef}
          className="mx-auto w-full max-w-md"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocus={() => setFocused(true)}
          onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocused(false); }}
        >
          <div className="mb-3 flex items-center gap-2">
            <div role="tablist" aria-label="Ejemplos por tipo de negocio" className="flex flex-1 gap-1 overflow-x-auto rounded-xl bg-surface-light p-1" onKeyDown={onTabKey}>
              {SCENARIOS.map((s, i) => (
                <button
                  key={s.id}
                  id={`${baseId}-tab-${i}`}
                  type="button"
                  role="tab"
                  aria-selected={i === active}
                  aria-controls={`${baseId}-panel`}
                  tabIndex={i === active ? 0 : -1}
                  onClick={() => goTo(i)}
                  className={cn(
                    "relative min-h-11 flex-1 whitespace-nowrap rounded-lg px-2.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong",
                    i === active ? "text-foreground" : "text-muted hover:text-foreground"
                  )}
                >
                  {i === active && (
                    <m.span layoutId={`${baseId}-pill`} className="absolute inset-0 rounded-lg bg-surface shadow-sm" transition={{ type: "spring", stiffness: 420, damping: 34 }} />
                  )}
                  <span className="relative">{s.label}</span>
                </button>
              ))}
            </div>
            {!reduce && (
              <button
                type="button"
                onClick={() => setPaused((p) => !p)}
                aria-label={paused ? "Reproducir demostración" : "Pausar demostración"}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong"
              >
                {paused ? <Play size={16} aria-hidden /> : <Pause size={16} aria-hidden />}
              </button>
            )}
          </div>

          <div
            id={`${baseId}-panel`}
            role="tabpanel"
            aria-labelledby={`${baseId}-tab-${active}`}
            aria-roledescription="demostración"
            // Mientras se reproduce no se anuncia cada mensaje; en pausa sí.
            aria-live={playing ? "off" : "polite"}
            // touch-pan-y: el scroll vertical sigue siendo del navegador, solo el gesto horizontal cambia de escenario.
            className="touch-pan-y rounded-xl border border-border bg-surface p-4 shadow-lg"
            onTouchStart={(e) => { touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
            onTouchEnd={(e) => {
              const start = touchStart.current;
              touchStart.current = null;
              if (!start) return;
              const dx = e.changedTouches[0].clientX - start.x;
              const dy = e.changedTouches[0].clientY - start.y;
              if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) goTo(active + (dx < 0 ? 1 : -1));
            }}
          >
            <AnimatePresence mode="wait" initial={false}>
              <m.div key={scenario.id} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.25 }}>
                <div className="flex items-center gap-3 border-b border-border pb-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-subtle text-sm font-semibold text-accent-ink">{scenario.contact.initials}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{scenario.contact.name}</p>
                    <p className="truncate text-xs text-muted">{scenario.contact.channel}</p>
                  </div>
                  <AnimatePresence>
                    {showOutcome && (
                      <m.span
                        initial={{ opacity: 0, scale: 0.6 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ type: "spring", stiffness: 500, damping: 22 }}
                        className={cn("shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium", TONE[scenario.outcome.tone])}
                      >
                        {scenario.outcome.text}
                      </m.span>
                    )}
                  </AnimatePresence>
                </div>

                {/* Alto fijo: la tarjeta no cambia de tamaño mientras llegan mensajes. */}
                <div className="flex h-[24.5rem] flex-col justify-start gap-2.5 overflow-hidden py-4 text-sm sm:h-[20rem]">
                  {visible.map((beat) => {
                    if (beat.type === "outcome") return null;
                    if (beat.type === "pick") {
                      const it = scenario.items[beat.index] as Extract<Item, { kind: "buttons" }>;
                      return (
                        <m.p key={`pick-${beat.index}`} {...bubbleMotion} className="max-w-[80%] rounded-2xl rounded-tl-sm bg-surface-light px-3 py-2">
                          {it.options[it.pick]}
                        </m.p>
                      );
                    }
                    const it = scenario.items[beat.index];
                    if (it.kind === "buttons") {
                      return (
                        <m.div key={`b-${beat.index}`} {...bubbleMotion} className="ml-auto flex max-w-[85%] flex-wrap justify-end gap-1.5">
                          {it.options.map((o, i) => (
                            <span
                              key={o}
                              className={cn(
                                "rounded-full border px-3 py-1 text-xs transition-colors duration-300",
                                picked.has(beat.index) && i === it.pick ? "border-accent-strong bg-accent text-on-accent" : "border-accent-muted text-accent-ink"
                              )}
                            >
                              {o}
                            </span>
                          ))}
                        </m.div>
                      );
                    }
                    return (
                      <m.p
                        key={`i-${beat.index}`}
                        {...bubbleMotion}
                        className={cn(
                          "max-w-[82%] rounded-2xl px-3 py-2",
                          it.kind === "client" ? "rounded-tl-sm bg-surface-light" : "ml-auto rounded-tr-sm bg-accent-muted"
                        )}
                      >
                        {it.text}
                      </m.p>
                    );
                  })}
                  <AnimatePresence>
                    {typing && (
                      <m.div key="typing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="ml-auto flex gap-1 rounded-2xl rounded-tr-sm bg-accent-muted px-3 py-3" aria-hidden>
                        {[0, 1, 2].map((d) => (
                          <span key={d} className="typing-dot h-1.5 w-1.5 rounded-full bg-accent-ink" style={{ animationDelay: `${d * 150}ms` }} />
                        ))}
                      </m.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="flex items-center gap-2 rounded-xl bg-accent-2-bg px-3 py-2 text-xs text-foreground">
                  <Sparkles size={14} className="shrink-0 text-accent-2" aria-hidden />
                  {scenario.status}
                </div>
              </m.div>
            </AnimatePresence>
          </div>

          {/* Progreso de la reproducción: una barra por escenario. */}
          <div className="mt-3 flex gap-1.5" aria-hidden>
            {SCENARIOS.map((s, i) => (
              <span key={s.id} className="h-1 flex-1 overflow-hidden rounded-full bg-accent-muted">
                <span
                  className="block h-full origin-left rounded-full bg-accent-strong transition-transform duration-500 ease-out"
                  style={{ transform: `scaleX(${i < active ? 1 : i === active ? shown / beats.length : 0})` }}
                />
              </span>
            ))}
          </div>
        </div>
      </MotionConfig>
    </LazyMotion>
  );
}
