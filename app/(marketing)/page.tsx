import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { Check } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import {
  formatMxn,
  PLAN_LIST,
  PRICE_UNIT,
  TRIAL_DAYS,
  TRIAL_MAX_SEATS,
  TRIAL_POOL_TEXT,
} from "@/lib/billing/plans";
import { COEXISTENCE_PITCH, META_FEES_NOTE, PRICING_FOOTNOTE } from "@/lib/billing/plan-features";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";
import { appUrl, siteUrl } from "@/lib/app-url";
import { HeroHeadline } from "./_hero-headline";
import { HowSteps } from "./_how-steps";
import { PlanCards } from "./_plan-cards";
import { ProductTour } from "./_product-tour";
import { Reveal } from "./_reveal";

const TITLE = `${BRAND_NAME} — ${BRAND_TAGLINE}`;
const MIN_PRICE = Math.min(...PLAN_LIST.map((p) => p.pricePerSeatMxn));
const DESCRIPTION = `Atiende WhatsApp, Instagram, Messenger y más desde una bandeja. Bots de IA, automatizaciones y pipeline de ventas. Desde ${formatMxn(MIN_PRICE)} ${PRICE_UNIT}. ${TRIAL_DAYS} días gratis.`;
const CTA = `Prueba ${TRIAL_DAYS} días gratis`;

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "es_MX",
    siteName: BRAND_NAME,
    url: "/",
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

const CHANNELS = ["WhatsApp", "Instagram", "Messenger", "Telegram", "Chat web"] as const;

const FAQ = [
  {
    q: "¿Necesito tarjeta para la prueba?",
    a: `No. Tienes ${TRIAL_DAYS} días con todo el plan Pro para hasta ${TRIAL_MAX_SEATS} ejecutivos, con ${TRIAL_POOL_TEXT}, sin tarjeta. Al terminar eliges un plan; si no lo haces, ese mismo día tu cuenta queda en solo lectura y tus datos se conservan.`,
  },
  {
    q: "¿Cómo conecto mi WhatsApp?",
    a: "Con la API oficial de WhatsApp Business de Meta. Cada ejecutivo puede conectar su propio número y seguir usándolo en el celular (Coexistencia). Te guiamos paso a paso.",
  },
  {
    q: "¿Cómo activo Instagram, Messenger, Telegram o el chat web?",
    a: "WhatsApp está disponible desde el registro. Los demás canales se habilitan en tu organización; escríbenos si quieres activarlos.",
  },
  {
    q: "¿Cómo se cobra?",
    a: `Por ejecutivo: cada persona de tu equipo que atiende conversaciones (incluido quien crea la cuenta) ocupa un asiento, con un precio mensual en pesos. ${PRICING_FOOTNOTE} ${META_FEES_NOTE}`,
  },
  {
    q: "¿Qué es un crédito de IA?",
    a: "Cada respuesta de un bot, sugerencia, calificación de un lead o paso de IA de una automatización usa un crédito. Cada plan (Negocio y Pro) incluye créditos al mes por ejecutivo, en una bolsa compartida; no configuras ninguna IA por tu cuenta.",
  },
  {
    q: "¿Puedo cambiar de plan o cancelar?",
    a: "Sí, cuando quieras y desde tu cuenta: cambias de plan o agregas y quitas ejecutivos, y el cambio se prorratea. Los pagos son mensuales, en pesos mexicanos (MXN), con tarjeta y procesados por Stripe.",
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

function jsonLd() {
  const data = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: BRAND_NAME,
      url: siteUrl("/"),
      description: DESCRIPTION,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      inLanguage: "es-MX",
      offers: PLAN_LIST.map((p) => ({
        "@type": "Offer",
        name: p.name,
        price: String(p.pricePerSeatMxn),
        priceCurrency: "MXN",
        description: `${formatMxn(p.pricePerSeatMxn)} ${PRICE_UNIT}`,
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQ.map(({ q, a }) => ({
        "@type": "Question",
        name: q,
        acceptedAnswer: { "@type": "Answer", text: a },
      })),
    },
  ];
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export default function LandingPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd() }} />

      {/* ── Hero: marca + promesa (el mock vive en ProductTour debajo) ── */}
      <section className="relative isolate overflow-hidden">
        <div
          aria-hidden
          className="landing-hero-glow pointer-events-none absolute inset-0 -z-10"
          style={{
            background: `
              radial-gradient(ellipse 70% 55% at 50% -5%, color-mix(in oklab, var(--accent-muted) 45%, transparent), transparent 70%),
              radial-gradient(ellipse 40% 30% at 20% 70%, color-mix(in oklab, var(--accent-2-bg) 70%, transparent), transparent 65%),
              radial-gradient(ellipse 35% 28% at 82% 55%, color-mix(in oklab, var(--accent-subtle) 80%, transparent), transparent 60%),
              linear-gradient(180deg, var(--background) 0%, var(--surface) 48%, var(--background) 100%)
            `,
          }}
        />
        <div className="mx-auto max-w-3xl px-4 pb-12 pt-12 text-center sm:pb-14 sm:pt-14 md:px-6 md:pb-16 md:pt-20 lg:pb-20 lg:pt-24">
          <p
            className="landing-hero-in font-display text-2xl font-semibold tracking-tight text-accent-ink min-[400px]:text-3xl sm:text-4xl"
            style={{ "--landing-delay": "0ms" } as CSSProperties}
          >
            {BRAND_NAME}
          </p>
          <HeroHeadline
            className="landing-hero-in mt-4 font-display text-[clamp(1.85rem,8.2vw,2.4rem)] font-semibold leading-[1.08] tracking-tight text-foreground sm:mt-5 sm:text-5xl sm:leading-[1.04] lg:text-[3.4rem]"
            style={{ "--landing-delay": "90ms" } as CSSProperties}
          />
          <p
            className="landing-hero-in mx-auto mt-4 max-w-xl text-pretty text-base leading-relaxed text-muted sm:mt-5 sm:text-lg"
            style={{ "--landing-delay": "180ms" } as CSSProperties}
          >
            Una bandeja para WhatsApp y tus otros canales, con bots que responden al instante y un pipeline que no deja leads en visto.
          </p>
          <div
            className="landing-hero-in mt-7 flex flex-col items-stretch justify-center gap-3 min-[400px]:flex-row min-[400px]:flex-wrap min-[400px]:items-center sm:mt-8"
            style={{ "--landing-delay": "270ms" } as CSSProperties}
          >
            <Button href="/register" size="lg" className="w-full min-[400px]:w-auto" data-track="cta" data-track-location="hero">
              {CTA}
            </Button>
            <Button href="/precios" variant="secondary" size="lg" className="w-full min-[400px]:w-auto">
              Ver precios
            </Button>
          </div>
          <p
            className="landing-hero-in mt-4 text-pretty text-sm text-muted-strong"
            style={{ "--landing-delay": "340ms" } as CSSProperties}
          >
            Sin tarjeta · Desde {formatMxn(MIN_PRICE)} {PRICE_UNIT} · API oficial de WhatsApp
          </p>
        </div>
      </section>

      {/* ── Tour: bandeja → pipeline → automatizaciones (debajo del hero) ── */}
      <ProductTour className="landing-mock-enter" />

      {/* ── Canales ── */}
      <section className="border-y border-border/60 bg-surface" aria-label="Canales">
        <div className="mx-auto flex max-w-6xl flex-wrap items-baseline gap-x-5 gap-y-2 px-4 py-6 min-[400px]:gap-x-8 min-[400px]:gap-y-3 sm:py-8 md:px-6">
          <p className="w-full text-sm text-muted-strong md:w-auto md:max-w-[14rem]">
            Todos tus mensajes en un solo lugar
          </p>
          {CHANNELS.map((label, i) => (
            <span
              key={label}
              className="landing-channel font-display text-lg font-semibold tracking-tight text-foreground sm:text-xl"
              style={{ "--landing-delay": `${120 + i * 70}ms` } as CSSProperties}
            >
              {label}
            </span>
          ))}
        </div>
      </section>

      {/* ── Beneficios (texto; los mocks viven solo en el tour) ── */}
      <section id="producto" className="scroll-mt-20 border-b border-border/50">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:py-20 md:px-6 md:py-24">
          <Reveal>
            <h2 className="max-w-2xl text-pretty font-display text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
              De la bandeja al cierre, sin cambiar de herramienta
            </h2>
            <p className="mt-4 max-w-2xl text-pretty text-base leading-relaxed text-muted sm:text-lg">
              Lo que viste arriba, aplicado al día a día: una bandeja, un pipeline y automatizaciones que dejan el cierre en manos de tu equipo.
            </p>
          </Reveal>
          <div className="mt-10 grid gap-8 sm:mt-12 sm:gap-10 md:grid-cols-3 md:gap-8">
            {(
              [
                {
                  title: "Una sola bandeja",
                  body: "WhatsApp, Instagram, Messenger, Telegram y el chat de tu web en el mismo hilo. Asigna, retoma y no pierdas mensajes entre cuentas.",
                  points: [
                    "Asignación y notificaciones al instante",
                    "Historial completo del contacto",
                    "Coexistencia con WhatsApp Business",
                  ],
                },
                {
                  title: "Pipeline hasta el cierre",
                  body: "Cada conversación entra al embudo. Tu equipo ve qué sigue y la IA ayuda a calificar.",
                  points: [
                    "Nuevos, Contactados, Calificados, Clientes",
                    "Calificación de leads con IA",
                    "Citas y recordatorios en el hilo",
                  ],
                },
                {
                  title: "Automatiza lo repetido",
                  body: "Menús, seguimiento y bots con el conocimiento de tu negocio. Cuando hace falta una persona, el chat pasa sin romper el hilo.",
                  points: [
                    "Flujos con botones",
                    "Bot de IA con tu conocimiento",
                    "Campañas con plantillas de Meta",
                  ],
                },
              ] as const
            ).map((block, i) => (
              <Reveal key={block.title} delay={i * 80} className="min-w-0">
                <h3 className="font-display text-xl font-semibold tracking-tight">{block.title}</h3>
                <p className="mt-2 text-pretty text-sm leading-relaxed text-muted">{block.body}</p>
                <ul className="mt-4 space-y-2 text-sm text-foreground">
                  {block.points.map((line) => (
                    <li key={line} className="flex gap-2.5">
                      <Check size={16} className="mt-0.5 shrink-0 text-accent-ink" aria-hidden />
                      <span className="min-w-0 text-pretty">{line}</span>
                    </li>
                  ))}
                </ul>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Cómo empezar ── */}
      <section id="como-funciona" className="scroll-mt-20 border-y border-border/50 bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:py-20 md:px-6 md:py-24">
          <Reveal>
            <h2 className="max-w-2xl text-pretty font-display text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
              En marcha en tres pasos
            </h2>
          </Reveal>
          <HowSteps />
          <Reveal delay={100}>
            <p className="mt-8 text-pretty text-sm text-muted sm:mt-10">
              {COEXISTENCE_PITCH} Instagram, Messenger, Telegram y chat web se habilitan cuando los necesites.{" "}
              <a href={appUrl("/docs/api")} className="font-medium text-accent-ink underline underline-offset-2">
                API para desarrolladores
              </a>
              .
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── Precios ── */}
      <section id="precios" className="scroll-mt-20">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:py-20 md:px-6 md:py-24">
          <Reveal>
            <h2 className="text-balance text-center font-display text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
              Un precio por ejecutivo, en pesos
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-pretty text-center text-muted">
              La IA viene incluida en Negocio y Pro. Empieza con {TRIAL_DAYS} días gratis del plan Pro para hasta {TRIAL_MAX_SEATS}{" "}
              ejecutivos, sin tarjeta.
            </p>
          </Reveal>
          <Reveal delay={80}>
            <PlanCards cta={CTA} trackPrefix="plan" className="mt-10 sm:mt-12" />
          </Reveal>
          <Reveal delay={120}>
            <p className="mt-8 text-pretty text-center text-sm text-muted">
              {PRICING_FOOTNOTE}{" "}
              <a href="/precios" className="font-medium text-accent-ink underline underline-offset-2">
                Calcula tu equipo y compara planes
              </a>
              . {META_FEES_NOTE}
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="preguntas" className="scroll-mt-20 border-t border-border/50 bg-surface">
        <div className="mx-auto max-w-3xl px-4 py-14 sm:py-20 md:px-6 md:py-24">
          <Reveal>
            <h2 className="text-balance text-center font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              Preguntas frecuentes
            </h2>
          </Reveal>
          <Reveal delay={80} className="mt-8 divide-y divide-border border-y border-border sm:mt-10">
            {FAQ.map(({ q, a }) => (
              <details key={q} className="group" data-track="faq">
                <summary className="flex min-h-14 cursor-pointer list-none items-start justify-between gap-3 py-3.5 text-left font-medium transition-colors hover:text-accent-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-strong sm:items-center sm:gap-4">
                  <span className="min-w-0 flex-1 text-pretty">{q}</span>
                  <span className="mt-0.5 shrink-0 text-muted transition-transform duration-200 group-open:rotate-45 sm:mt-0" aria-hidden>
                    +
                  </span>
                </summary>
                <p className="pb-4 text-pretty text-sm leading-relaxed text-muted">{a}</p>
              </details>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ── CTA final ── */}
      <section className="relative isolate overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(135deg,var(--teal-700),var(--teal-600)_55%,var(--graphite-800))]"
        />
        <Reveal className="mx-auto max-w-3xl px-4 py-14 text-center text-on-accent sm:py-20 md:px-6 md:py-24">
          <h2 className="text-balance font-display text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
            Tu próximo cliente ya te está escribiendo
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-pretty text-base opacity-90">
            Crea tu cuenta en un minuto. Conecta WhatsApp hoy y empieza la prueba de {TRIAL_DAYS} días.
          </p>
          <Button
            href="/register"
            variant="secondary"
            size="lg"
            className="mt-8 w-full min-[400px]:w-auto"
            data-track="cta"
            data-track-location="cierre"
          >
            {CTA}
          </Button>
        </Reveal>
      </section>
    </>
  );
}
