import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  Bot,
  CalendarCheck,
  Check,
  Globe,
  Inbox,
  Camera,
  Megaphone,
  MessageCircle,
  Send,
  Sparkles,
  Target,
  Workflow,
  X,
} from "lucide-react";
import { auth } from "@/lib/auth";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
import { cn } from "@/app/components/ui/cn";
import { PLAN_LIST, TRIAL_DAYS } from "@/lib/billing/plans";
import { planFeatures } from "@/lib/billing/plan-features";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";

export const metadata: Metadata = {
  title: { absolute: `${BRAND_NAME} — ${BRAND_TAGLINE}` },
  description: `WhatsApp, Instagram, Messenger, Telegram y el chat de tu web en una sola bandeja, con bots de IA, automatizaciones y seguimiento de leads. Desde 5 USD al mes, ${TRIAL_DAYS} días gratis.`,
};

const CHANNELS = [
  { label: "WhatsApp", icon: MessageCircle },
  { label: "Instagram", icon: Camera },
  { label: "Messenger", icon: MessageCircle },
  { label: "Telegram", icon: Send },
  { label: "Chat de tu web", icon: Globe },
];

const FEATURES = [
  {
    icon: Inbox,
    title: "Una sola bandeja para todo tu equipo",
    text: "Todos tus canales en un lugar. Asigna conversaciones, etiqueta clientes y sabe quién respondió qué.",
  },
  {
    icon: Bot,
    title: "Bots de IA que conocen tu negocio",
    text: "Responden al instante con tu información y tus precios, entienden fotos y te pasan la plática cuando hace falta.",
  },
  {
    icon: Workflow,
    title: "Automatizaciones con botones",
    text: "Menús de bienvenida, preguntas de calificación y seguimientos que se envían solos, en todos los canales.",
  },
  {
    icon: Target,
    title: "Leads calificados y pipeline",
    text: "La IA marca quién está listo para comprar y tu equipo mueve cada oportunidad por etapas hasta cerrar.",
  },
  {
    icon: Megaphone,
    title: "Campañas de WhatsApp",
    text: "Envía plantillas aprobadas por Meta a tus listas y mide entregas, lecturas y respuestas.",
  },
  {
    icon: CalendarCheck,
    title: "Citas y recordatorios",
    text: "Agenda desde el chat o deja que el bot proponga el horario; tu equipo recibe el recordatorio a tiempo.",
  },
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

// Vista de ejemplo de la bandeja (solo marcado, sin datos reales).
function InboxPreview() {
  return (
    <div className="relative mx-auto w-full max-w-md rounded-2xl border border-border bg-surface p-4 shadow-lg">
      <div className="flex items-center gap-3 border-b border-border pb-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-sm font-semibold text-accent">MR</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">María Rodríguez</p>
          <p className="text-xs text-muted">WhatsApp · Lead de anuncio</p>
        </div>
        <Badge tone="success" size="sm">Caliente</Badge>
      </div>
      <div className="space-y-2.5 py-4 text-sm">
        <p className="max-w-[80%] rounded-2xl rounded-tl-sm bg-surface-light px-3 py-2">Hola, ¿cuánto cuesta el facial hidratante?</p>
        <p className="ml-auto max-w-[80%] rounded-2xl rounded-tr-sm bg-accent/10 px-3 py-2">
          ¡Hola María! El facial hidratante cuesta $850 y dura 60 min. ¿Te gustaría agendar?
        </p>
        <div className="ml-auto flex max-w-[80%] flex-wrap justify-end gap-1.5">
          {["Agendar cita", "Ver otros servicios", "Hablar con alguien"].map((b) => (
            <span key={b} className="rounded-full border border-accent/40 px-3 py-1 text-xs text-accent">{b}</span>
          ))}
        </div>
        <p className="max-w-[80%] rounded-2xl rounded-tl-sm bg-surface-light px-3 py-2">Agendar cita 🙌</p>
      </div>
      <div className="flex items-center gap-2 rounded-xl bg-accent-2-bg px-3 py-2 text-xs text-foreground">
        <Sparkles size={14} className="shrink-0 text-accent-2" aria-hidden />
        Respondido por tu bot de IA en 3 segundos
      </div>
    </div>
  );
}

export default async function LandingPage() {
  const session = await auth();
  if (session?.user) redirect(session.user.role === "ejecutivo" ? "/whatsapp/chat" : "/dashboard");

  return (
    <>
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-12 md:grid-cols-2 md:px-6 md:pt-20">
        <div className="animate-fade-in-up">
          <p className="text-eyebrow font-medium uppercase tracking-wider text-accent">{BRAND_NAME}</p>
          <h1 className="mt-3 font-display text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
            Vende por WhatsApp sin dejar a ningún cliente en visto
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted">
            Todos tus chats en una bandeja, un bot de IA que responde al instante y automatizaciones que dan seguimiento
            por ti. Para negocios que venden por mensaje.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button href="/register" size="lg">Empieza gratis {TRIAL_DAYS} días</Button>
            <Button href="#precios" variant="secondary" size="lg">Ver precios</Button>
          </div>
          <p className="mt-3 text-sm text-muted-darker">Sin tarjeta · Desde 5 USD al mes · Cancela cuando quieras</p>
        </div>
        <div className="animate-fade-in-up animation-delay-200">
          <InboxPreview />
        </div>
      </section>

      <section className="border-y border-border/60 bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-4 py-6 text-sm text-muted md:px-6">
          <span className="text-muted-darker">Conecta:</span>
          {CHANNELS.map(({ label, icon: Icon }) => (
            <span key={label} className="inline-flex items-center gap-2 font-medium text-foreground">
              <Icon size={16} className="text-accent" aria-hidden />
              {label}
            </span>
          ))}
        </div>
      </section>

      <section id="funciones" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 md:px-6">
        <p className="text-eyebrow font-medium uppercase tracking-wider text-muted-darker">Funciones</p>
        <h2 className="mt-2 max-w-2xl font-display text-3xl font-semibold tracking-tight">
          Todo lo que tu equipo necesita para atender y vender por chat
        </h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
                <Icon size={20} aria-hidden />
              </span>
              <h3 className="mt-4 font-display text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-muted">{text}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-sm text-muted">
          Además: API y webhooks para conectar tu tienda o ERP, reportes por agente y campos personalizados para tu giro.
        </p>
      </section>

      <section id="precios" className="scroll-mt-20 border-y border-border/60 bg-surface">
        <div className="mx-auto max-w-4xl px-4 py-20 md:px-6">
          <p className="text-center text-eyebrow font-medium uppercase tracking-wider text-muted-darker">Precios</p>
          <h2 className="mt-2 text-center font-display text-3xl font-semibold tracking-tight">Precios simples, en dólares</h2>
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
                    "flex flex-col rounded-2xl border bg-background p-6 shadow-sm",
                    featured ? "border-accent ring-1 ring-accent" : "border-border"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-display text-xl font-semibold">{plan.name}</h3>
                    {featured && <Badge tone="accent" size="sm">Más elegido</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-muted">{plan.tagline}</p>
                  <p className="mt-5">
                    <span className="font-display text-hero leading-none tabular-nums">${plan.priceUsd}</span>
                    <span className="text-sm text-muted"> USD / mes</span>
                  </p>
                  <ul className="mt-5 flex-1 space-y-2.5 text-sm">
                    {planFeatures(plan).map((f) => (
                      <li key={f.text} className={cn("flex items-start gap-2", !f.included && "text-muted-darker")}>
                        {f.included ? (
                          <Check size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden />
                        ) : (
                          <X size={16} className="mt-0.5 shrink-0" aria-hidden />
                        )}
                        <span className={cn(!f.included && "line-through")}>{f.text}</span>
                      </li>
                    ))}
                  </ul>
                  <Button href="/register" variant={featured ? "primary" : "secondary"} fullWidth className="mt-6">
                    Empezar prueba gratis
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section id="preguntas" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-20 md:px-6">
        <h2 className="text-center font-display text-3xl font-semibold tracking-tight">Preguntas frecuentes</h2>
        <div className="mt-10 divide-y divide-border rounded-2xl border border-border bg-surface">
          {FAQ.map(({ q, a }) => (
            <details key={q} className="group px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                {q}
                <span className="text-muted transition-transform group-open:rotate-45" aria-hidden>+</span>
              </summary>
              <p className="mt-3 text-sm text-muted">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20 md:px-6">
        <div className="rounded-3xl bg-accent px-6 py-12 text-center text-on-accent md:px-12">
          <h2 className="font-display text-3xl font-semibold tracking-tight">Tu próximo cliente ya te está escribiendo</h2>
          <p className="mx-auto mt-3 max-w-xl opacity-90">Crea tu cuenta en un minuto y conecta tu primer canal hoy.</p>
          <Button href="/register" variant="secondary" size="lg" className="mt-8">
            Empieza gratis {TRIAL_DAYS} días
          </Button>
        </div>
      </section>
    </>
  );
}
