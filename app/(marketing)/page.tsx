import type { Metadata } from "next";
import { TRIAL_DAYS } from "@/lib/billing/plans";
import { LICENSES, TRIAL_AI_CREDITS_PER_USER, TRIAL_MAX_USERS } from "@/lib/billing/licenses";
import { COEXISTENCE_PITCH, META_FEES_NOTE } from "@/lib/billing/plan-features";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";
import { appUrl, siteUrl } from "@/lib/app-url";
import { ChannelRow, DemoInbox, DemoRoute, WaitClock } from "./_demos";
import { LandingFaq } from "./_faq";
import { LandingOffer } from "./_landing-offer";
import { LANDING_PLANS, OFFER_FROM_MXN } from "./_landing-offer-data";
import { QuickReply, Thread, type ThreadItem } from "./_thread";

// Landing (2026-11-08): mundo Andén y dirección "la página es una
// conversación" (brief: .impeccable/surfaces/app-marketing-page-tsx.md).
// Le habla primero al dueño que atiende solo; los equipos van más abajo.
// Todos los chats son de ejemplo y se rotulan así.

const TITLE = `${BRAND_NAME} — ${BRAND_TAGLINE}`;
const DESCRIPTION = `Atiende WhatsApp, Instagram, Messenger y más desde una bandeja, con un bot de IA que responde con lo que sabe tu negocio. Desde $${OFFER_FROM_MXN} MXN por usuario al mes. ${TRIAL_DAYS} días gratis.`;
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

const HERO_THREAD: ThreadItem[] = [
  { kind: "day", text: "Hoy · 23:40" },
  { kind: "in", text: "Hola, ¿cuánto cuesta el facial hidratante?", time: "23:40" },
  { kind: "out", sender: "Bot · Spa Aurora", text: "¡Hola, María! El facial hidratante cuesta $850 y dura 60 minutos. ¿Quieres que te agendemos?", time: "23:40" },
  { kind: "in", text: "Sí, el sábado en la mañana", time: "23:41" },
];

const HANDOFF_THREAD: ThreadItem[] = [
  { kind: "in", text: "Sí, el sábado en la mañana", time: "23:41" },
  { kind: "note", text: "Ana tomó el chat · el bot se pausa 30 min" },
  { kind: "out", sender: "Ana", text: "¡Buenos días, María! Te apartamos el sábado a las 11:00. ¿Te queda bien?", time: "8:05" },
  { kind: "in", text: "Perfecto, ahí nos vemos", time: "8:07" },
];

// Equipos: el segundo perfil, contado con notas de sistema del mismo hilo.
const TEAM_THREAD: ThreadItem[] = [
  { kind: "day", text: "Martes · 10:12" },
  { kind: "in", text: "Hola, ¿tienen los tenis en talla 25?", time: "10:12" },
  { kind: "note", text: "Asignado a Luis · Equipo Tienda · en línea" },
  { kind: "out", sender: "Luis", text: "¡Hola, Daniela! Sí, nos quedan dos pares. ¿Te los aparto?", time: "10:14" },
  { kind: "note", text: "Respondido en 2 min · dentro del tiempo de respuesta" },
];

const TEAM_POINTS = [
  "Asignación automática entre quienes están en línea",
  "Equipos: cada chat llega solo a sus integrantes",
  "Tiempos de respuesta con aviso cuando se vencen",
  "Tres roles: administrador, usuario y ejecutivo",
];

// Cómo empezar: el orden importa, por eso cada mensaje lleva su número.
const STEPS_THREAD: ThreadItem[] = [
  { kind: "in", text: "¿Y cómo empiezo?", time: "9:00" },
  { kind: "out", sender: BRAND_NAME, text: <><strong>1. Crea tu cuenta y conecta WhatsApp.</strong> API oficial de Meta. {COEXISTENCE_PITCH}</>, time: "9:00" },
  { kind: "out", sender: BRAND_NAME, typing: false, text: <><strong>2. Enséñale a tu bot tu negocio.</strong> Precios, servicios y preguntas frecuentes; lo demás lo atiendes tú.</>, time: "9:01" },
  { kind: "out", sender: BRAND_NAME, typing: false, text: <><strong>3. Atiende y vende desde la bandeja.</strong> Desde el celular o la compu, hasta la venta.</>, time: "9:01" },
];

const PRICE_THREAD: ThreadItem[] = [
  { kind: "in", text: `¿Cuánto cuesta ${BRAND_NAME}?`, time: "9:02" },
  {
    kind: "out",
    sender: BRAND_NAME,
    text: `Desde $${OFFER_FROM_MXN} MXN por persona al mes, y cada quien puede tener su propio plan. Los primeros ${TRIAL_DAYS} días son gratis con Pro, sin tarjeta.`,
    time: "9:02",
  },
];

const H2 = "text-balance font-display text-[2.25rem] font-bold leading-[1.02] tracking-[-0.01em] sm:text-5xl lg:text-[3.5rem]";
const H3 = "text-balance font-display text-3xl font-bold leading-[1.05] sm:text-[2.25rem]";
const LEDE = "text-pretty text-base leading-relaxed text-muted sm:text-lg";

export default function LandingPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd() }} />

      {/* ── Portada: el titular y el hilo que lo demuestra ── */}
      <section className="mx-auto grid max-w-6xl gap-6 px-4 pb-12 pt-6 sm:pt-10 md:px-6 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_minmax(0,27rem)] lg:items-center lg:gap-16 lg:pb-20 lg:pt-16">
        <div className="min-w-0">
          <h1 className="text-balance font-display text-[2.75rem] font-bold leading-[0.98] tracking-[-0.015em] sm:text-6xl lg:text-[5rem]">
            Contesta cada chat, aunque estés ocupado.
          </h1>
          <p className={`mt-4 max-w-xl ${LEDE} lg:mt-6`}>
            WhatsApp, Instagram, Messenger, Telegram y el chat de tu web en una sola bandeja, con un bot que responde con lo que sabe tu negocio.
          </p>
          <p className="mt-6 hidden text-sm text-muted-darker lg:block">
            Sin tarjeta · Desde ${OFFER_FROM_MXN} MXN por usuario al mes · API oficial de WhatsApp
          </p>
        </div>
        <div className="min-w-0">
          <Thread
            auto
            label="Conversación de ejemplo entre una clienta y el bot de un spa"
            items={HERO_THREAD}
            footer={
              <>
                <QuickReply href="/register" primary track="hero">
                  {CTA}, sin tarjeta
                </QuickReply>
                <QuickReply href="#precios">Ver precios · desde ${OFFER_FROM_MXN} MXN</QuickReply>
              </>
            }
          />
          <p className="mt-2 text-center text-xs text-muted-darker">Conversación de ejemplo</p>
        </div>
      </section>

      {/* ── Lo que sigue en el hilo ── */}
      <section id="producto" className="scroll-mt-20 border-t border-border bg-surface">
        <div className="mx-auto max-w-6xl px-4 pt-14 sm:pt-16 md:px-6 lg:pt-20">
          <h2 className={`max-w-3xl ${H2}`}>Lo que pasa después, en el mismo lugar.</h2>
        </div>

        <div className="mx-auto grid max-w-6xl gap-8 px-4 pb-10 pt-8 md:px-6 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_minmax(0,27rem)] lg:gap-16 lg:pb-16 lg:pt-12">
          <div className="min-w-0 lg:pt-4">
            <h3 className={H3}>Ves quién lleva más tiempo esperando.</h3>
            <p className={`mt-3 max-w-lg ${LEDE}`}>
              Todos tus canales llegan a una sola lista, ordenada por espera. A los 15 minutos se enciende una luz ámbar; a la hora, roja.
            </p>
            <ChannelRow className="mt-5" />
          </div>
          <DemoInbox />
        </div>

        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:px-6 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_minmax(0,27rem)] lg:gap-16 lg:py-16">
          <div className="min-w-0 lg:pt-4">
            <h3 className={H3}>Tú tomas el chat cuando hace falta.</h3>
            <p className={`mt-3 max-w-lg ${LEDE}`}>
              El bot contesta con lo que sabe tu negocio; lo demás lo atiendes tú desde la misma conversación. Cuando respondes, el bot se pausa 30 minutos para no encimarse.
            </p>
          </div>
          <div className="min-w-0">
            <Thread label="Continuación de ejemplo: una persona del spa toma el chat" items={HANDOFF_THREAD} startMs={150} />
          </div>
        </div>

        <div className="mx-auto grid max-w-6xl gap-8 px-4 pb-16 pt-10 sm:pb-20 md:px-6 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_minmax(0,27rem)] lg:gap-16 lg:pb-28 lg:pt-16">
          <div className="min-w-0 lg:pt-4">
            <h3 className={H3}>Cada chat avanza hasta la venta.</h3>
            <p className={`mt-3 max-w-lg ${LEDE}`}>
              Nuevo, Contactado, Calificado, Cliente: ves en qué estación va cada persona, con sus citas, notas y tareas en el mismo contacto.
            </p>
          </div>
          <DemoRoute />
        </div>
      </section>

      {/* ── Equipos: notas de sistema del mismo hilo ── */}
      <section className="border-t border-border">
        <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-8 px-4 py-16 sm:py-20 md:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,27rem)] lg:gap-16 lg:py-24">
          <div className="min-w-0 lg:pt-4">
            <h2 className={H3}>¿Atiendes con un equipo?</h2>
            <p className={`mt-3 max-w-lg ${LEDE}`}>Lo de equipos aparece cuando lo usas; si atiendes solo, no estorba.</p>
            <ul className="mt-5 flex max-w-lg flex-col gap-2 text-[15px]">
              {TEAM_POINTS.map((t) => (
                <li key={t} className="flex gap-2.5">
                  <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground" />
                  <span className="min-w-0 text-pretty">{t}</span>
                </li>
              ))}
            </ul>
          </div>
          <Thread label="Conversación de ejemplo en un equipo: el chat se asigna y se responde a tiempo" items={TEAM_THREAD} startMs={150} />
        </div>
      </section>

      {/* ── Cómo empezar ── */}
      <section id="como-funciona" className="scroll-mt-20 border-t border-border bg-surface">
        <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-8 px-4 py-16 sm:py-20 md:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,27rem)] lg:gap-16 lg:py-24">
          <div className="min-w-0 lg:pt-4">
            <h2 className={H2}>Empiezas hoy, en tres pasos.</h2>
            <p className="mt-5 max-w-lg text-pretty text-sm text-muted">
              Instagram, Messenger, Telegram y el chat web también se conectan con tus credenciales.{" "}
              <a href={appUrl("/docs/api")} className="font-medium text-accent-ink underline underline-offset-4">
                API para desarrolladores
              </a>
              .
            </p>
          </div>
          <Thread label="Conversación de ejemplo: los tres pasos para empezar" items={STEPS_THREAD} startMs={150} />
        </div>
      </section>

      {/* ── Precios: primero la respuesta corta, luego la tabla ── */}
      <section id="precios" className="scroll-mt-20 border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20 md:px-6 lg:py-24">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,27rem)] lg:gap-16">
            <div className="min-w-0 lg:pt-4">
              <h2 className={H2}>Elige la licencia de cada persona.</h2>
              <p className={`mt-4 max-w-lg ${LEDE}`}>Puedes mezclar planes en un mismo equipo. El pago es mensual y cancelas cuando quieras.</p>
            </div>
            <Thread
              label="Conversación de ejemplo sobre el precio"
              items={PRICE_THREAD}
              startMs={150}
              footer={<QuickReply href="/precios#comparar">Compara los planes</QuickReply>}
            />
          </div>
          <LandingOffer cta={CTA} />
        </div>
      </section>

      {/* ── Preguntas: respuestas rápidas que abren su respuesta ── */}
      <section id="preguntas" className="scroll-mt-20 border-t border-border bg-surface">
        <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-8 px-4 py-16 sm:py-20 md:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,36rem)] lg:gap-16 lg:py-24">
          <div className="min-w-0">
            <h2 className={H2}>Preguntas frecuentes.</h2>
            <p className="mt-4 text-pretty text-muted">
              ¿Otra duda?{" "}
              <a href="/contacto" className="font-medium text-accent-ink underline underline-offset-4">
                Escríbenos
              </a>
              .
            </p>
          </div>
          <LandingFaq items={FAQ} />
        </div>
      </section>

      {/* ── Cierre: el último mensaje sigue esperando respuesta ── */}
      <section className="border-t border-border">
        <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-8 px-4 py-16 sm:py-20 md:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,27rem)] lg:items-center lg:gap-16 lg:py-28">
          <h2 className="text-balance font-display text-[2.75rem] font-bold leading-[0.98] tracking-[-0.015em] sm:text-6xl lg:text-[5rem]">
            Tu próximo cliente ya te está escribiendo.
          </h2>
          <div className="min-w-0">
            <Thread
              label="Mensaje de ejemplo que espera respuesta"
              startMs={150}
              items={[
                { kind: "day", text: "Ahora" },
                { kind: "in", text: "Hola, ¿todavía tienen lugar para hoy?", time: "Ahora" },
                { kind: "note", text: <span className="inline-flex items-center gap-2">Esperando respuesta <WaitClock clock="0:16" spoken="16 minutos" lamp="warning" /></span> },
              ]}
              footer={
                <QuickReply href="/register" primary track="cierre">
                  {CTA}, sin tarjeta
                </QuickReply>
              }
            />
            <p className="mt-2 text-center text-xs text-muted-darker">Conversación de ejemplo · pago mensual, cancelas cuando quieras</p>
          </div>
        </div>
      </section>
    </>
  );
}
