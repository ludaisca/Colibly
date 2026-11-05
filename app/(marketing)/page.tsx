import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { Check } from "lucide-react";
import { InstagramIcon, MessengerIcon, TelegramIcon, WebchatIcon, WhatsAppIcon } from "@/app/components/ui/channel-icons";
import { Button } from "@/app/components/ui/button";
import { TRIAL_DAYS } from "@/lib/billing/plans";
import { LICENSES, TRIAL_AI_CREDITS_PER_USER, TRIAL_MAX_USERS } from "@/lib/billing/licenses";
import { COEXISTENCE_PITCH, META_FEES_NOTE } from "@/lib/billing/plan-features";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";
import { appUrl, siteUrl } from "@/lib/app-url";
import { HeroHeadline } from "./_hero-headline";
import { HowSteps } from "./_how-steps";
import { LandingOffer } from "./_landing-offer";
import { LANDING_PLANS, OFFER_FROM_MXN } from "./_landing-offer-data";
import { ProductTour } from "./_product-tour";
import { Reveal } from "./_reveal";

const TITLE = `${BRAND_NAME} — ${BRAND_TAGLINE}`;
const DESCRIPTION = `Atiende WhatsApp, Instagram, Messenger y más desde una bandeja. Bots de IA, automatizaciones y pipeline de ventas. Desde $${OFFER_FROM_MXN} MXN por usuario al mes. ${TRIAL_DAYS} días gratis.`;
const CTA = `Prueba ${TRIAL_DAYS} días de Pro`;

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

function ChannelIcon({ name }: { name: (typeof CHANNELS)[number] }) {
  const props = { size: 18, className: "text-accent-ink" };
  switch (name) {
    case "WhatsApp":
      return <WhatsAppIcon {...props} />;
    case "Instagram":
      return <InstagramIcon {...props} />;
    case "Messenger":
      return <MessengerIcon {...props} />;
    case "Telegram":
      return <TelegramIcon {...props} />;
    case "Chat web":
      return <WebchatIcon {...props} />;
  }
}

const FAQ = [
  {
    q: "¿Necesito tarjeta para la prueba?",
    a: `No. Tienes ${TRIAL_DAYS} días con todas las funciones (licencia Pro para hasta ${TRIAL_MAX_USERS} personas, ${TRIAL_AI_CREDITS_PER_USER} créditos de IA cada una), sin tarjeta. Al terminar contratas las licencias de tu equipo; si no lo haces, ese mismo día tu cuenta queda en solo lectura y tus datos se conservan.`,
  },
  {
    q: "¿Cómo conecto mi WhatsApp?",
    a: "Con la API oficial de WhatsApp Business de Meta. Cada persona de tu equipo puede conectar su propio número y seguir usándolo en el celular (Coexistencia). Te guiamos paso a paso.",
  },
  {
    q: "¿Cómo activo Instagram, Messenger, Telegram o el chat web?",
    a: "Con cualquier licencia. Cada persona de tu equipo trae un canal de cada tipo: un WhatsApp, un Instagram, un Messenger, un Telegram y un chat web. Cada canal funciona con la licencia de su dueño; por ejemplo, el bot responde en los canales de quien tiene Avanzado o Pro.",
  },
  {
    q: "¿Cómo se cobra?",
    a: `Cada persona de tu equipo paga una licencia, cada mes, en pesos: Básico $59, Avanzado $89 o Pro $149, y puedes mezclarlas (por ejemplo, tres Básico y un Pro). Empresarial es a la medida. ${META_FEES_NOTE}`,
  },
  {
    q: "¿Qué es un crédito de IA?",
    a: `Una respuesta del bot, una sugerencia, una calificación o un paso de IA. Son de cada persona: ${LICENSES.BUSINESS.aiCreditsPerMonth.toLocaleString("es-MX")} al mes con Avanzado y ${LICENSES.PRO.aiCreditsPerMonth.toLocaleString("es-MX")} con Pro (Básico no incluye IA). Lo que hace el bot en un chat usa los créditos del dueño de ese canal. Se renuevan en la fecha de facturación.`,
  },
  {
    q: "¿Puedo cambiar de plan o cancelar?",
    a: "Sí. Puedes cambiar la licencia de cada persona, agregar o quitar licencias, o cancelar cuando quieras. El pago es mensual y los cambios se prorratean.",
  },
  {
    q: "¿Los créditos que no uso se acumulan?",
    a: "No. Se restablecen en tu fecha de facturación. Si a alguien se le acaban antes, puedes subir su licencia a Pro.",
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
      offers: LANDING_PLANS.filter((p) => p.priceMxn != null).map((p) => ({
        "@type": "Offer",
        name: p.name,
        price: String(p.priceMxn),
        priceCurrency: "MXN",
        description: `$${p.priceMxn} MXN por usuario al mes.`,
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
        <div className="mx-auto max-w-3xl px-4 pb-8 pt-10 text-center sm:pb-10 sm:pt-12 md:px-6 md:pb-12 md:pt-16 lg:pb-14 lg:pt-20">
          <p
            className="landing-hero-in text-xs font-semibold uppercase tracking-[0.18em] text-accent-ink"
            style={{ "--landing-delay": "0ms" } as CSSProperties}
          >
            CRM conversacional con IA
          </p>
          <HeroHeadline
            className="landing-hero-in mt-4 font-display text-[clamp(1.6rem,6.8vw,2.25rem)] font-semibold leading-[1.1] tracking-tight text-foreground sm:mt-5 sm:text-5xl sm:leading-[1.05] lg:text-[3.3rem]"
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
            <Button href="#precios" variant="secondary" size="lg" className="w-full min-[400px]:w-auto">
              Ver precios
            </Button>
          </div>
          <p
            className="landing-hero-in mt-4 text-pretty text-sm text-muted-strong"
            style={{ "--landing-delay": "340ms" } as CSSProperties}
          >
            Sin tarjeta · Desde ${OFFER_FROM_MXN} MXN por usuario al mes · API oficial de WhatsApp
          </p>
        </div>
      </section>

      {/* ── Tour: bandeja → pipeline → automatizaciones (debajo del hero) ── */}
      <ProductTour className="landing-mock-enter" />

      {/* ── Canales ── */}
      <section className="border-y border-border/60 bg-surface" aria-label="Canales">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:py-7 md:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-strong">Todos tus mensajes en un solo lugar</p>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 min-[400px]:gap-x-7">
              {CHANNELS.map((label, i) => (
                <span
                  key={label}
                  className="landing-channel inline-flex items-center gap-2 font-display text-lg font-semibold tracking-tight text-foreground sm:text-xl"
                  style={{ "--landing-delay": `${120 + i * 70}ms` } as CSSProperties}
                >
                  <ChannelIcon name={label} />
                  {label}
                </span>
              ))}
            </div>
          </div>
          <p className="mt-2 text-xs text-muted">
            Conecta cada canal con tus propias credenciales desde tu cuenta. Cada licencia incluye un canal de cada tipo.
          </p>
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
              {COEXISTENCE_PITCH} Instagram, Messenger, Telegram y chat web también se conectan con tus credenciales.{" "}
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
              Elige la licencia de cada persona
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-pretty text-center text-muted">
              {TRIAL_DAYS} días gratis, sin tarjeta. Cada persona paga su licencia, cada mes, y puedes mezclar planes.
            </p>
          </Reveal>
          <LandingOffer cta={CTA} />
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
            {FAQ.map(({ q, a }, i) => (
              <details key={q} className="group" data-track="faq" open={i === 0}>
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
          <Reveal delay={120}>
            <p className="mt-6 text-center text-sm text-muted">
              ¿Otra duda?{" "}
              <a href="/contacto" className="font-medium text-accent-ink underline underline-offset-2">
                Escríbenos
              </a>
              .
            </p>
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
            Crea tu cuenta en un minuto. Conecta WhatsApp hoy y empieza la prueba de {TRIAL_DAYS} días de Pro.
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
          <p className="mt-4 text-sm text-on-accent">Sin tarjeta · Pago mensual.</p>
        </Reveal>
      </section>
    </>
  );
}
