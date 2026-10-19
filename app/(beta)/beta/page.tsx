import type { Metadata } from "next";
import { connection } from "next/server";
import { ArrowRight, Bot, Check, CircleHelp, Inbox, MessageCircle, ShieldCheck, Smartphone, Users } from "lucide-react";
import { BRAND_NAME } from "@/lib/brand";
import { siteUrl } from "@/lib/app-url";
import { formatMxn, PLAN_LIST, PRICE_CURRENCY_NOTE, PRICE_TAX_NOTE, PRICE_UNIT, TRIAL_DAYS, TRIAL_MAX_SEATS, TRIAL_POOL } from "@/lib/billing/plans";
import { COEXISTENCE_PITCH, META_FEES_NOTE } from "@/lib/billing/plan-features";
import { BetaApplicationForm } from "./_application-form";

const title = `${BRAND_NAME} — Vende por WhatsApp sin perder conversaciones`;
const description = `Reúne tus chats, clientes y equipo en un solo lugar. Te ayudamos a configurar un asistente de IA para tu negocio. Crea tu cuenta y prueba ${TRIAL_DAYS} días sin costo y sin tarjeta.`;

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: siteUrl("/") },
    openGraph: { type: "website", locale: "es_MX", siteName: BRAND_NAME, url: siteUrl("/"), title, description },
    twitter: { card: "summary_large_image", title, description },
  };
}

const benefits = [
  { icon: Inbox, title: "Todos los chats, a la vista", text: "Tu equipo atiende desde una misma bandeja y sabe qué conversación necesita respuesta." },
  { icon: Bot, title: "Respuestas con tu información", text: "Preparamos un asistente con tus servicios, precios y preguntas frecuentes para ayudarte a responder." },
  { icon: Users, title: "Cada cliente tiene seguimiento", text: "Guarda sus datos, asigna la conversación y retoma oportunidades sin empezar de cero." },
];

// Coexistencia = función de Meta: el mismo número vive a la vez en la app
// WhatsApp Business del teléfono y en la API (la que usa Colibly). Texto sin
// promesas de más: se habilita por cuenta y depende de Meta (país, versión de
// la app). No inventar métricas ni "100% de funciones" en la app.
const coexistence = [
  { icon: Smartphone, title: "Sigues usando tu app", text: "Contestas desde la app WhatsApp Business de tu teléfono, con el mismo número y los mismos chats de siempre." },
  { icon: Inbox, title: "Tu equipo comparte la bandeja", text: "Los mensajes también aparecen en Colibly, donde varias personas pueden atenderlos, asignarlos y darles seguimiento." },
  { icon: Bot, title: "La IA, cuando tú quieras", text: "Activa el asistente para ayudar a responder con tu información y pausa las respuestas automáticas cuando prefieras contestar tú." },
];

const steps = [
  { number: "01", title: "Crea tu cuenta", text: "Regístrate en un minuto con tu correo y confírmalo. No pedimos tarjeta." },
  { number: "02", title: "Conecta WhatsApp y enseña a tu asistente", text: "Te guiamos para conectar tu número, agregar a tu equipo y cargar tus servicios, precios y preguntas frecuentes." },
  { number: "03", title: "Pruébalo en tu día a día", text: `Tu equipo usa Colibly con clientes reales durante ${TRIAL_DAYS} días. Si necesitas ayuda, escríbenos.` },
];

const faq = [
  { q: "¿Necesito saber de tecnología para empezar?", a: "No. Te guiamos paso a paso en la conexión y la configuración inicial, y puedes escribirnos si te atoras. Necesitarás tener control de tu número y autorizar la conexión desde tu cuenta de negocio." },
  { q: `¿Cuándo comienzan los ${TRIAL_DAYS} días?`, a: `Al crear tu cuenta. Tienes ${TRIAL_DAYS} días con el plan Pro completo para probar Colibly en tu negocio.` },
  { q: "¿Me cobrarán al terminar?", a: "No. No pedimos tarjeta para crear tu cuenta ni hay cobro automático al terminar la prueba. Tú eliges si continúas con un plan; si no, tu cuenta pasa a solo lectura y tus datos se conservan." },
  { q: "¿Cuánto cuesta después de la prueba?", a: `Se paga por ejecutivo: ${PLAN_LIST.map((p) => `${p.name} ${formatMxn(p.pricePerSeatMxn)} ${PRICE_UNIT}`).join(", ")}${PRICE_TAX_NOTE ? ` (${PRICE_TAX_NOTE})` : ""}; la IA viene incluida en Negocio y Pro. ${PRICE_CURRENCY_NOTE} ${COEXISTENCE_PITCH} Los precios pueden ajustarse; consulta la página de precios.` },
  { q: "¿Hay algún otro costo por usar WhatsApp?", a: `${META_FEES_NOTE} Te ayudamos a entenderlo antes de conectar tu número.` },
  { q: "¿Puedo detener las respuestas de IA?", a: "Sí. Tu equipo puede atender directamente y pausar el asistente cuando lo necesite. Prueba sus respuestas con tu información antes de activarlo." },
];

export default function BetaPage() {
  return (
    <>
      <section className="relative isolate overflow-hidden border-b border-border/70 bg-background [background-image:radial-gradient(var(--accent-muted)_1px,transparent_1.2px)] [background-size:22px_22px]">
        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-[1.05fr_.95fr] md:items-center md:gap-12 md:px-6 md:py-24">
          <div className="max-w-xl">
            <span className="inline-flex items-center gap-2 rounded-xl border border-accent-muted bg-accent-subtle px-3 py-1.5 text-xs font-bold uppercase tracking-[0.13em] text-accent-ink"><span className="h-2 w-2 rounded-full bg-accent" /> Registro abierto · {TRIAL_DAYS} días gratis</span>
            <h1 className="mt-6 font-display text-[clamp(2.7rem,6vw,5.2rem)] font-semibold leading-[1.03] tracking-tight text-foreground">Cada chat puede ser <span className="text-accent-ink">una oportunidad.</span></h1>
            <p className="mt-6 max-w-lg text-lg leading-8 text-muted">Reúne tu WhatsApp, tus clientes y tu equipo en un solo lugar. Un asistente de IA te ayuda a responder con la información de tu negocio, mientras tú mantienes el control.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="/register" data-track="cta" data-track-location="beta_hero" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-accent px-6 text-sm font-semibold text-on-accent shadow-md transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong">Crear mi cuenta gratis <ArrowRight size={17} aria-hidden /></a>
              <a href="#como-funciona" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border bg-surface px-6 text-sm font-semibold text-foreground transition-colors hover:bg-surface-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong">Ver cómo funciona</a>
            </div>
            <p className="mt-4 text-sm text-muted-strong">{TRIAL_DAYS} días sin costo · Sin tarjeta · Cancela cuando quieras</p>
          </div>
          <div className="relative mx-auto w-full max-w-lg" aria-label="Ejemplo ilustrativo de una conversación en Colibly">
            <div className="relative overflow-hidden rounded-[22px] border border-border bg-surface shadow-xl">
              <div className="flex items-center gap-3 border-b border-border bg-background px-5 py-4">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-accent-subtle text-accent-ink"><MessageCircle size={19} aria-hidden /></div>
                <div className="min-w-0 flex-1"><p className="text-sm font-semibold">Bandeja de tu equipo</p><p className="text-xs text-muted">Todos saben qué sigue</p></div>
                <span className="rounded-lg bg-success-bg px-2.5 py-1 text-xs font-semibold text-success">En línea</span>
              </div>
              <div className="grid min-h-[290px] grid-cols-[112px_1fr] sm:grid-cols-[158px_1fr]">
                <div className="border-r border-border bg-background/70 p-2 sm:p-3">
                  <p className="px-2 pb-2 text-xs font-bold uppercase tracking-wide text-muted">Conversaciones</p>
                  <div className="rounded-xl border border-accent-muted bg-accent-subtle px-2 py-3"><p className="truncate text-xs font-semibold text-foreground">Mariana G.</p><p className="mt-1 truncate text-xs text-muted">Quiere una cita</p></div>
                  <div className="mt-2 rounded-xl px-2 py-3"><p className="truncate text-xs font-medium text-foreground">Carlos R.</p><p className="mt-1 truncate text-xs text-muted">Pidió precios</p></div>
                  <div className="mt-1 rounded-xl px-2 py-3"><p className="truncate text-xs font-medium text-foreground">Lucía M.</p><p className="mt-1 truncate text-xs text-muted">En seguimiento</p></div>
                </div>
                <div className="flex flex-col gap-3 p-3 sm:p-5">
                  <p className="text-xs font-semibold text-muted">Mariana G. · WhatsApp</p>
                  <div className="max-w-[88%] self-start rounded-[12px] rounded-tl-sm bg-surface-light px-3 py-2 text-xs leading-5 text-foreground">Hola, ¿tienen horarios para una consulta esta semana?</div>
                  <div className="max-w-[92%] self-end rounded-[12px] rounded-tr-sm bg-accent-subtle px-3 py-2 text-xs leading-5 text-foreground">¡Hola! Tenemos espacios el jueves y viernes. ¿Qué día te funciona mejor?</div>
                  <div className="mt-auto flex flex-wrap gap-1.5"><span className="rounded-lg bg-info-bg px-2 py-1 text-xs font-medium text-info">Nueva oportunidad</span><span className="rounded-lg bg-success-bg px-2 py-1 text-xs font-medium text-success">Pendiente de agendar</span></div>
                </div>
              </div>
            </div>
            <div className="relative -mt-5 ml-auto mr-3 flex w-fit items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground shadow-lg"><span className="grid h-7 w-7 place-items-center rounded-lg bg-accent-subtle text-accent-ink"><Bot size={15} aria-hidden /></span> Respuesta preparada con IA</div>
            <p className="mt-3 text-center text-sm text-muted-strong">Ejemplo ilustrativo</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-17 md:px-6 md:py-24" aria-labelledby="benefits-title">
        <div className="grid gap-4 lg:grid-cols-[1.15fr_.85fr] lg:items-end lg:gap-16"><div><p className="text-xs font-bold uppercase tracking-[0.15em] text-accent-ink">Lo que cambia</p><h2 id="benefits-title" className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl lg:text-[2.6rem] lg:leading-[1.1]">Menos chats perdidos. Más conversaciones que avanzan.</h2></div><p className="text-base leading-7 text-muted lg:pb-1 lg:text-lg lg:leading-8">Empieza con lo esencial para atender bien, responder a tiempo y saber a quién dar seguimiento.</p></div>
        <div className="mt-9 grid gap-4 md:grid-cols-3">
          {benefits.map(({ icon: Icon, title: itemTitle, text }) => <article key={itemTitle} className="rounded-[18px] border border-border bg-surface p-6 shadow-sm"><span className="grid h-11 w-11 place-items-center rounded-xl bg-accent-subtle text-accent-ink"><Icon size={21} aria-hidden /></span><h3 className="mt-5 font-display text-xl font-semibold">{itemTitle}</h3><p className="mt-3 text-sm leading-6 text-muted">{text}</p></article>)}
        </div>
      </section>

      <section id="coexistencia" className="scroll-mt-24 border-y border-border bg-surface/70 py-17 md:py-24" aria-labelledby="coex-title">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 md:px-6 lg:grid-cols-[.9fr_1.1fr] lg:items-center lg:gap-16">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-accent-ink">WhatsApp Coexistence</p>
            <h2 id="coex-title" className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Conserva tu número y tu app de WhatsApp Business.</h2>
            <p className="mt-5 text-base leading-7 text-muted">Con la coexistencia de Meta, el mismo número funciona a la vez en la app WhatsApp Business de tu teléfono y en la API oficial. No tienes que cambiar de número ni dejar de contestar desde el celular: Colibly suma la bandeja compartida y la IA.</p>
            <p className="mt-4 rounded-xl border border-border bg-background p-4 text-sm leading-6 text-muted-strong">Es una función de Meta y se habilita por cuenta; requiere la app WhatsApp Business (no la de uso personal) y su disponibilidad y límites los define Meta. Si quieres usarla, <a href="/contacto" className="font-medium text-accent-ink underline underline-offset-2">escríbenos</a> y lo revisamos contigo.</p>
          </div>
          <ul className="grid gap-4">
            {coexistence.map(({ icon: Icon, title: itemTitle, text }) => <li key={itemTitle} className="flex gap-4 rounded-[18px] border border-border bg-background p-5 shadow-sm sm:p-6"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-subtle text-accent-ink"><Icon size={21} aria-hidden /></span><div><h3 className="font-display text-lg font-semibold">{itemTitle}</h3><p className="mt-1.5 text-sm leading-6 text-muted">{text}</p></div></li>)}
          </ul>
        </div>
      </section>

      <section id="como-funciona" className="scroll-mt-24 py-17 md:py-24" aria-labelledby="steps-title">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 md:px-6 lg:grid-cols-[.85fr_1.15fr] lg:gap-16"><div className="lg:sticky lg:top-28 lg:self-start"><p className="text-xs font-bold uppercase tracking-[0.15em] text-accent-ink">Empezar es sencillo</p><h2 id="steps-title" className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl lg:text-[2.6rem] lg:leading-[1.1]">Tú conoces tu negocio. Nosotros te ayudamos a ponerlo en marcha.</h2></div>
          <ol className="grid gap-4">{steps.map(({ number, title: stepTitle, text }) => <li key={number} className="flex gap-5 rounded-[18px] border border-border bg-surface p-6"><span className="font-display text-2xl font-semibold text-accent-ink">{number}</span><div><h3 className="text-lg font-semibold">{stepTitle}</h3><p className="mt-2 text-sm leading-6 text-muted">{text}</p></div></li>)}</ol>
        </div>
      </section>

      <section id="incluye" className="scroll-mt-24 mx-auto grid max-w-6xl gap-9 px-4 py-17 md:grid-cols-[.9fr_1.1fr] md:items-center md:px-6 md:py-24" aria-labelledby="offer-title">
        <div><p className="text-xs font-bold uppercase tracking-[0.15em] text-accent-ink">La prueba gratis</p><h2 id="offer-title" className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Dos semanas para comprobarlo en tu propio negocio.</h2><p className="mt-5 text-base leading-7 text-muted">Crea tu cuenta y usa Colibly con tu equipo y tus clientes reales. Al terminar decides si sigues con un plan; si no, no pasa nada con tu tarjeta porque no la pedimos.</p><a href="/register" data-track="cta" data-track-location="beta_oferta" className="mt-6 inline-flex min-h-11 items-center gap-2 font-semibold text-accent-ink underline underline-offset-4">Crear mi cuenta gratis <ArrowRight size={16} aria-hidden /></a></div>
        <div className="rounded-[22px] border border-accent-muted bg-accent-subtle p-6 shadow-lg sm:p-8"><div className="flex flex-wrap items-center justify-between gap-2"><span className="rounded-lg bg-accent px-3 py-1 text-xs font-bold text-on-accent">REGISTRO ABIERTO</span><span className="text-sm font-semibold text-accent-ink">Sin lista de espera</span></div><p className="mt-6 font-display text-5xl font-semibold tracking-tight text-foreground">{TRIAL_DAYS} días <span className="text-2xl text-muted">sin costo</span></p><p className="mt-2 text-sm text-muted">La prueba comienza al crear tu cuenta.</p><ul className="mt-7 space-y-3">{["Plan Pro completo durante la prueba", `Hasta ${TRIAL_MAX_SEATS} ejecutivos, cada uno con su propio WhatsApp (Coexistencia)`, "Bandeja compartida y seguimiento de clientes", `Asistente de IA con tu información (${TRIAL_POOL.aiCreditsPerMonth.toLocaleString("es-MX")} créditos al mes para todo el equipo)`, "Ayuda por correo cuando la necesites"].map((item) => <li key={item} className="flex gap-3 text-sm leading-6"><Check size={18} className="mt-0.5 shrink-0 text-success" aria-hidden /><span>{item}</span></li>)}</ul><p className="mt-7 border-t border-border pt-5 text-sm leading-6 text-muted-strong">Sin tarjeta ni cobro automático. El uso de IA y canales tiene los límites del plan. Meta cobra aparte algunos mensajes de WhatsApp; ese cargo se paga directamente a Meta. <a href="/precios" className="font-medium text-accent-ink underline underline-offset-2">Ver planes y precios</a>.</p></div>
      </section>

      <section id="preguntas" className="scroll-mt-24 border-y border-border bg-surface/70 py-17 md:py-24" aria-labelledby="faq-title"><div className="mx-auto grid max-w-6xl gap-8 px-4 md:grid-cols-[.8fr_1.2fr] md:px-6"><div><p className="text-xs font-bold uppercase tracking-[0.15em] text-accent-ink">Sin sorpresas</p><h2 id="faq-title" className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Preguntas frecuentes</h2><p className="mt-4 text-sm leading-6 text-muted">¿Hay algo más que quieras saber? Escríbenos a <a href="mailto:contacto@colibly.com" className="font-medium text-accent-ink underline underline-offset-4">contacto@colibly.com</a>.</p></div><div className="space-y-3">{faq.map(({ q, a }) => <details key={q} data-track="faq" className="group rounded-xl border border-border bg-background px-5 py-4"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold marker:content-none [&::-webkit-details-marker]:hidden">{q}<CircleHelp size={17} className="shrink-0 text-accent-ink" aria-hidden /></summary><p className="pt-3 text-sm leading-6 text-muted">{a}</p></details>)}</div></div></section>

      <section id="solicitar" className="scroll-mt-24 mx-auto grid max-w-6xl gap-10 px-4 py-17 md:grid-cols-[.8fr_1.2fr] md:items-center md:px-6 md:py-24" aria-labelledby="apply-title"><div><p className="text-xs font-bold uppercase tracking-[0.15em] text-accent-ink">Tu siguiente paso</p><h2 id="apply-title" className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Crea tu cuenta, o cuéntanos de tu negocio.</h2><p className="mt-5 text-base leading-7 text-muted">El registro es abierto: <a href="/register" className="font-medium text-accent-ink underline underline-offset-4">crea tu cuenta gratis</a> y empieza hoy. Si prefieres que una persona te oriente antes, déjanos tus datos y te escribimos.</p><div className="mt-7 flex items-start gap-3 text-sm text-muted"><ShieldCheck size={20} className="shrink-0 text-accent-ink" aria-hidden /><p>Tú mantienes el control de tu número y decides qué información usa el asistente.</p></div></div><BetaApplicationForm /></section>
    </>
  );
}
