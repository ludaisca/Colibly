import type { Metadata } from "next";
import {
  BadgeCheck,
  Bot,
  CalendarCheck,
  Check,
  Globe,
  Inbox,
  Lock,
  Camera,
  Megaphone,
  MessageCircle,
  Send,
  Store,
  Stethoscope,
  Target,
  UtensilsCrossed,
  Briefcase,
  Workflow,
  X,
  Sparkles,
} from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
import { cn } from "@/app/components/ui/cn";
import { PLAN_LIST, TRIAL_DAYS } from "@/lib/billing/plans";
import { planFeatures } from "@/lib/billing/plan-features";
import { HeroDemo } from "./_hero-demo";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";
import { siteUrl } from "@/lib/app-url";

const TITLE = `${BRAND_NAME} — ${BRAND_TAGLINE}`;
const DESCRIPTION = `Atiende WhatsApp con bots de IA, automatizaciones y seguimiento de leads. Instagram, Messenger, Telegram y chat web disponibles por habilitación. Desde 5 USD al mes, ${TRIAL_DAYS} días gratis.`;
const MIN_PRICE = Math.min(...PLAN_LIST.map((p) => p.priceUsd));
// Un solo texto para la acción principal en toda la página (el header usa la versión corta).
const CTA = `Prueba ${TRIAL_DAYS} días gratis`;

// La landing original queda disponible para comparar el diseño durante la beta.
// En el dominio público, la raíz se reescribe a /beta y esta página vive en
// /producto con noindex.
export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: { type: "website", locale: "es_MX", siteName: BRAND_NAME, url: "/", title: TITLE, description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

const CHANNELS = [
  { label: "WhatsApp", icon: MessageCircle },
  { label: "Instagram", icon: Camera },
  { label: "Messenger", icon: MessageCircle },
  { label: "Telegram", icon: Send },
  { label: "Chat de tu web", icon: Globe },
];

// Las tres primeras son para atender y las tres siguientes para vender; el tono
// del ícono marca el grupo (en lg quedan como dos filas).
const FEATURES = [
  {
    icon: Inbox,
    title: "Todo tu equipo en los mismos chats, sin perder ninguno",
    text: "Una sola bandeja para los canales que habilites. Asigna conversaciones y sabe quién respondió qué.",
  },
  {
    icon: Bot,
    title: "Respuestas al instante, aunque sean las 11 de la noche",
    text: "Un bot de IA que conoce tu información y tus precios, entiende fotos y te pasa la plática cuando hace falta.",
  },
  {
    icon: Workflow,
    title: "Seguimientos que se envían solos",
    text: "Automatizaciones con botones: menús de bienvenida, preguntas de calificación y recordatorios, en todos los canales.",
  },
  {
    icon: Target,
    title: "Sabes quién está listo para comprar",
    text: "Califica leads con IA y lleva cada negocio por las etapas de tu pipeline, con tareas de seguimiento, vista “Mi día” y reportes de ventas.",
  },
  {
    icon: Megaphone,
    title: "Vuelve a escribirle a tus clientes con campañas",
    text: "Envía plantillas de WhatsApp aprobadas por Meta a tus listas y mide entregas, lecturas y respuestas.",
  },
  {
    icon: CalendarCheck,
    title: "Citas sin ir y venir de mensajes",
    text: "Agenda desde el chat o deja que el bot proponga el horario; tu equipo recibe el recordatorio a tiempo.",
  },
];

// Es una secuencia real (lo que hace un cliente nuevo), por eso va numerada.
const STEPS = [
  {
    title: "Crea tu cuenta y conecta tu WhatsApp",
    text: "Con la API oficial de WhatsApp Business. Puedes solicitar la habilitación de Instagram, Messenger, Telegram y el chat de tu web.",
  },
  {
    title: "Enséñale a tu bot tu negocio",
    text: "Escribe cómo debe atender y sube tus precios, servicios y preguntas frecuentes. El bot responde con esa información.",
  },
  {
    title: "Atiende y vende desde una bandeja",
    text: "Tu equipo toma las conversaciones que el bot no resuelve, y el pipeline te muestra quién está por comprar.",
  },
];

const USE_CASES = [
  { icon: Store, title: "Tiendas", text: "Responde precios y existencias al instante y da seguimiento a quien preguntó y no compró." },
  { icon: Stethoscope, title: "Consultorios, spas y salones", text: "El bot agenda la cita y a tu equipo le llega el recordatorio antes de que empiece." },
  { icon: UtensilsCrossed, title: "Restaurantes", text: "Menú de bienvenida con botones para horarios, ubicación, pedidos y reservaciones." },
  { icon: Briefcase, title: "Servicios e inmobiliarias", text: "Califica a los prospectos de tus anuncios y pásale al asesor los que van en serio." },
];

const TRUST = [
  { icon: BadgeCheck, text: "API oficial de WhatsApp Business" },
  { icon: Lock, text: "Pagos seguros con Stripe" },
  { icon: Check, text: "Sin tarjeta · Cancela cuando quieras" },
];

const FAQ = [
  {
    q: "¿Necesito tarjeta para la prueba?",
    a: `No. Tienes ${TRIAL_DAYS} días con todo el plan Pro, sin tarjeta. Al terminar eliges un plan; si no lo haces, tu cuenta queda en solo lectura y tus datos se conservan.`,
  },
  {
    q: "¿Cómo conecto mi WhatsApp?",
    a: "Con la API oficial de WhatsApp Business de Meta, la forma aprobada para que las empresas usen WhatsApp con un sistema como este. Te guiamos paso a paso para conectarlo.",
  },
  {
    q: "¿Cómo activo Instagram, Messenger, Telegram o el chat web?",
    a: "Escríbenos para habilitar el canal en tu organización. WhatsApp está disponible desde el registro; los canales adicionales se activan manualmente.",
  },
  {
    q: "¿Qué es un crédito de IA?",
    a: "Cada respuesta de un bot, sugerencia, calificación de un lead o paso de IA de una automatización usa un crédito. Cada plan incluye créditos cada mes; no necesitas contratar ni configurar ninguna IA por tu cuenta.",
  },
  {
    q: "¿Puedo cambiar de plan o cancelar?",
    a: "Sí, cuando quieras y desde tu cuenta. Los pagos son en dólares (USD) con tarjeta, procesados por Stripe.",
  },
  {
    q: "¿Qué pasa si se me olvida pagar?",
    a: "Tienes 7 días de gracia con todo funcionando. Después la cuenta queda en solo lectura: ves tus datos y los mensajes de tus clientes se siguen recibiendo, pero no se envían respuestas hasta que se actualiza el pago.",
  },
  {
    q: "¿Mis datos están seguros?",
    a: "Cada empresa tiene su propio espacio aislado, las credenciales se guardan cifradas y solo las personas que invitas ven tus conversaciones.",
  },
];

// Datos estructurados para Google: el software con sus planes y las preguntas.
function jsonLd() {
  const data = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: BRAND_NAME,
      url: siteUrl("/producto"),
      description: DESCRIPTION,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      inLanguage: "es-MX",
      offers: PLAN_LIST.map((p) => ({ "@type": "Offer", name: p.name, price: String(p.priceUsd), priceCurrency: "USD" })),
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQ.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
    },
  ];
  // "<" escapado para que ningún texto pueda cerrar el <script>.
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export default function LandingPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd() }} />
      <section className="relative isolate overflow-hidden">
        {/* Color de marca detrás de la vista previa, sin competir con el título. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 [mask-image:linear-gradient(to_bottom,black_65%,transparent)]"
          style={{
            background:
              "radial-gradient(55% 60% at 80% 20%, color-mix(in oklab, var(--accent) 22%, transparent), transparent 70%), radial-gradient(40% 45% at 5% 90%, color-mix(in oklab, var(--accent-2) 8%, transparent), transparent 70%)",
          }}
        />
        {/* Dos columnas desde lg: en tablet el título se partía en 5 renglones. */}
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-20 pt-12 md:px-6 md:pt-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,.95fr)] lg:gap-14 lg:pb-24 lg:pt-24">
          {/* El texto del hero no se anima: es el elemento más grande de la primera
              pantalla y animarlo desde opacidad 0 retrasaba el LCP en móvil. */}
          <div>
            <p className="inline-flex items-center gap-2 rounded-xl border border-accent-muted bg-accent-subtle px-3 py-1.5 text-xs font-semibold text-accent-ink"><Sparkles size={14} aria-hidden /> CRM de WhatsApp con IA</p>
            <h1 className="mt-5 max-w-2xl font-display text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.5rem]">
              Vende por WhatsApp sin dejar a ningún cliente{" "}
              <mark className="whitespace-nowrap rounded-lg bg-accent-muted px-2 text-foreground [box-decoration-break:clone]">en visto</mark>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
              Todos tus chats en una bandeja, un bot de IA que responde al instante y automatizaciones que dan seguimiento
              por ti. Para negocios que venden por mensaje.
            </p>
            <p className="mt-6 inline-flex flex-wrap items-baseline gap-x-2 rounded-xl border border-accent-muted bg-accent-subtle px-4 py-2">
              <span className="font-display text-xl font-semibold tabular-nums">Desde ${MIN_PRICE} USD al mes</span>
              <span className="text-sm text-muted">con la IA incluida</span>
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button href="/register" size="lg" data-track="cta" data-track-location="hero">{CTA}</Button>
              <Button href="#precios" variant="secondary" size="lg">Ver precios</Button>
            </div>
            <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted" aria-label="Por qué confiar">
              {TRUST.map(({ icon: Icon, text }) => (
                <li key={text} className="inline-flex items-center gap-1.5">
                  <Icon size={16} className="shrink-0 text-accent-2" aria-hidden />
                  {text}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative min-w-0 rounded-xl border border-accent-muted bg-accent-subtle/60 p-3 shadow-sm sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3 px-1 text-xs font-medium text-accent-ink">
              <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-accent-strong" /> Una conversación, de principio a fin</span>
              <span className="hidden sm:inline">Ejemplo ilustrativo</span>
            </div>
            <HeroDemo />
          </div>
        </div>
      </section>

      <section className="border-y border-border/60 bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-4 gap-y-3 px-4 py-6 text-sm text-muted md:px-6">
          <span className="w-full text-center text-xs font-semibold uppercase tracking-wider text-muted lg:w-auto lg:text-left">Tus conversaciones, en un lugar</span>
          {CHANNELS.map(({ label, icon: Icon }) => (
            <span key={label} className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 font-medium text-foreground">
              <Icon size={16} className="text-accent-ink" aria-hidden />
              {label}
            </span>
          ))}
          <span className="w-full text-center text-xs text-muted">Instagram, Messenger, Telegram y chat web requieren habilitación previa.</span>
        </div>
      </section>

      <section aria-labelledby="como-funciona" className="mx-auto max-w-6xl px-4 pt-20 md:px-6">
        <p className="text-eyebrow font-medium uppercase tracking-wider text-muted">Cómo funciona</p>
        <h2 id="como-funciona" className="reveal mt-2 max-w-2xl font-display text-3xl font-semibold tracking-tight">
          Empieza a atender con IA hoy mismo
        </h2>
        <ol className="steps-track relative mt-10 grid gap-5 md:grid-cols-3">
          {/* Línea que une los 3 números (solo en md+): pista fija y relleno ligado al scroll. */}
          <span aria-hidden className="absolute left-5 top-5 hidden h-0.5 w-[calc((100%+1.25rem)*2/3)] -translate-y-1/2 rounded-full bg-accent-muted md:block">
            <span className="steps-fill block h-full origin-left rounded-full bg-accent-strong" />
          </span>
          {STEPS.map(({ title, text }, i) => (
            <li key={title} className="reveal relative flex gap-4 md:flex-col md:gap-3">
              <span className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent font-display text-lg font-semibold text-on-accent tabular-nums ring-4 ring-background" aria-hidden>
                {i + 1}
              </span>
              <div>
                <h3 className="font-display text-lg font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-muted">{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section id="funciones" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 md:px-6">
        <p className="text-eyebrow font-medium uppercase tracking-wider text-muted">Funciones</p>
        <h2 className="reveal mt-2 max-w-2xl font-display text-3xl font-semibold tracking-tight">
          Todo lo que tu equipo necesita para atender y vender por chat
        </h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, text }, i) => (
            <article key={title} className={cn("reveal group flex flex-col rounded-xl border border-border bg-surface p-5 shadow-sm transition-[translate,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-md", i < 2 && "lg:col-span-2 lg:min-h-72", i === 0 && "border-accent-muted bg-accent-subtle/50")}>
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">{i < 3 ? "Atiende" : "Convierte"} · 0{i + 1}</span>
              <span
                className={cn(
                  "mt-4 flex h-10 w-10 items-center justify-center rounded-xl transition-transform duration-300 ease-out group-hover:-rotate-6 group-hover:scale-110",
                  i < 3 ? "bg-accent-subtle text-accent-ink" : "bg-accent-2-bg text-accent-2"
                )}
              >
                <Icon size={20} aria-hidden />
              </span>
              <h3 className="mt-4 max-w-md font-display text-lg font-semibold">{title}</h3>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">{text}</p>
              {i === 0 && (
                <div className="mt-6 grid gap-2 text-xs sm:grid-cols-3" aria-label="Ejemplo de flujo de atención">
                  <div className="rounded-xl border border-border bg-background p-3"><span className="font-semibold text-accent-ink">01 · Entra</span><p className="mt-1 text-muted">«¿Tienen disponibilidad?»</p></div>
                  <div className="rounded-xl border border-border bg-background p-3"><span className="font-semibold text-accent-ink">02 · Responde</span><p className="mt-1 text-muted">La IA resuelve la duda</p></div>
                  <div className="rounded-xl border border-border bg-background p-3"><span className="font-semibold text-accent-ink">03 · Continúa</span><p className="mt-1 text-muted">Tu equipo toma el chat</p></div>
                </div>
              )}
              {i === 1 && (
                <div className="mt-auto pt-6" aria-label="Ejemplo de conocimiento del bot">
                  <div className="flex items-start gap-3 rounded-xl border border-accent-muted bg-background p-3 text-xs"><Sparkles size={16} className="mt-0.5 shrink-0 text-accent-ink" aria-hidden /><span><strong className="block text-foreground">Tu bot conoce tu negocio</strong><span className="mt-1 block text-muted">Precios · Servicios · Preguntas frecuentes</span></span></div>
                </div>
              )}
            </article>
          ))}
        </div>
        <p className="mt-6 text-sm text-muted">
          Además: API y webhooks para conectar tu tienda o ERP, reportes por agente y campos personalizados para tu giro.
        </p>
      </section>

      <section aria-labelledby="giros" className="mx-auto max-w-6xl px-4 pb-20 md:px-6">
        <p className="text-eyebrow font-medium uppercase tracking-wider text-muted">Para tu negocio</p>
        <h2 id="giros" className="reveal mt-2 max-w-2xl font-display text-3xl font-semibold tracking-tight">
          Si vendes por mensaje, te sirve
        </h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {USE_CASES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="reveal group rounded-xl border border-border bg-surface p-5 transition-[translate,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-md">
              <Icon size={22} className="text-accent-ink transition-transform duration-300 ease-out group-hover:-translate-y-0.5 group-hover:scale-110" aria-hidden />
              <h3 className="mt-3 font-display text-base font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-muted">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="precios" className="scroll-mt-20 border-y border-border/60 bg-surface">
        <div className="mx-auto max-w-4xl px-4 py-20 md:px-6">
          <p className="text-center text-eyebrow font-medium uppercase tracking-wider text-muted">Precios</p>
          <h2 className="reveal mt-2 text-center font-display text-3xl font-semibold tracking-tight">Precios simples, en dólares</h2>
          <p className="mt-3 text-center text-muted">
            La IA ya viene incluida. Empieza con {TRIAL_DAYS} días gratis del plan Pro, sin tarjeta.
          </p>
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {PLAN_LIST.map((plan) => {
              const featured = plan.id === "PRO";
              return (
                <div
                  key={plan.id}
                  className={cn(
                    "reveal flex flex-col rounded-xl border p-6 shadow-sm",
                    featured ? "border-accent-strong bg-accent-subtle ring-1 ring-accent-strong shadow-md" : "border-border bg-background"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-display text-xl font-semibold">{plan.name}</h3>
                    {featured && <Badge tone="accent" size="sm">Recomendado</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-muted">{plan.tagline}</p>
                  <p className="mt-5">
                    <span className="font-display text-hero leading-none tabular-nums">${plan.priceUsd}</span>
                    <span className="text-sm text-muted"> USD / mes</span>
                  </p>
                  <ul className="mt-5 flex-1 space-y-2.5 text-sm">
                    {planFeatures(plan).map((f) => (
                      <li key={f.text} className={cn("flex items-start gap-2", !f.included && "text-muted")}>
                        {f.included ? (
                          <Check size={16} className="mt-0.5 shrink-0 text-accent-ink" aria-hidden />
                        ) : (
                          <X size={16} className="mt-0.5 shrink-0" aria-hidden />
                        )}
                        {/* Sin tachado: con el gris claro no llegaba al contraste mínimo. */}
                        <span>{!f.included && <span className="sr-only">No incluye: </span>}{f.text}</span>
                      </li>
                    ))}
                  </ul>
                  <Button href="/register" variant={featured ? "primary" : "secondary"} size="lg" fullWidth className="mt-6" data-track="cta" data-track-location={`plan_${plan.id.toLowerCase()}`}>
                    {CTA}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section id="preguntas" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-20 md:px-6">
        <h2 className="reveal text-center font-display text-3xl font-semibold tracking-tight">Preguntas frecuentes</h2>
        <div className="reveal mt-10 divide-y divide-border rounded-xl border border-border bg-surface">
          {FAQ.map(({ q, a }) => (
            <details key={q} className="group" data-track="faq">
              {/* El relleno va en el summary para que toda la fila sea tocable. */}
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-3 font-medium transition-colors hover:bg-surface-light focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-strong">
                {q}
                <span className="text-muted transition-transform group-open:rotate-45" aria-hidden>+</span>
              </summary>
              <p className="px-5 pb-4 text-sm text-muted">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20 md:px-6">
        <div className="reveal relative overflow-hidden rounded-xl bg-accent px-6 py-12 text-center text-on-accent md:px-12">
          <h2 className="font-display text-3xl font-semibold tracking-tight">Tu próximo cliente ya te está escribiendo</h2>
          <p className="mx-auto mt-3 max-w-xl opacity-90">Crea tu cuenta en un minuto y conecta tu primer canal hoy.</p>
          <Button href="/register" variant="secondary" size="lg" className="mt-8" data-track="cta" data-track-location="cierre">
            {CTA}
          </Button>
        </div>
      </section>
    </>
  );
}
