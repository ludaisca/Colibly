import type { Metadata } from "next";
import { connection } from "next/server";
import { ArrowRight, Bot, Check, CircleHelp, Inbox, MessageCircle, ShieldCheck, Users } from "lucide-react";
import { BRAND_NAME } from "@/lib/brand";
import { siteUrl } from "@/lib/app-url";
import { BetaApplicationForm } from "./_application-form";

const title = `${BRAND_NAME} Beta — Vende por WhatsApp sin perder conversaciones`;
const description = "Reúne tus chats, clientes y equipo en un solo lugar. Te ayudamos a configurar un asistente de IA para tu negocio. Solicita 30 días de beta sin costo y sin tarjeta.";

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

const steps = [
  { number: "01", title: "Nos cuentas cómo atiendes", text: "Una conversación breve para conocer tu negocio, tus clientes y lo que te gustaría mejorar." },
  { number: "02", title: "Lo dejamos listo contigo", text: "Te guiamos para conectar WhatsApp, agregar a tu equipo y preparar las primeras respuestas del asistente." },
  { number: "03", title: "Lo pruebas en tu día a día", text: "Tu equipo usa Colibly con clientes reales. Revisamos contigo qué funciona y qué debemos ajustar." },
];

const faq = [
  { q: "¿Necesito saber de tecnología para empezar?", a: "No. Te acompañamos en la conexión y la configuración inicial. Necesitarás tener control de tu número y autorizar la conexión desde tu cuenta de negocio." },
  { q: "¿Cuándo comienzan los 30 días?", a: "Cuando tu cuenta esté preparada para usarla. Coordinaremos contigo la fecha de activación antes de empezar la prueba." },
  { q: "¿Me cobrarán al terminar?", a: "No habrá cobro automático por la beta ni pedimos tarjeta para solicitar acceso. Antes de terminar, podrás decidir si continúas con uno de los planes disponibles." },
  { q: "¿Hay algún otro costo por usar WhatsApp?", a: "Meta puede cobrar algunos mensajes de WhatsApp según el tipo de mensaje y el destino. Te ayudaremos a entenderlo antes de conectar tu número; esos cargos son independientes de Colibly." },
  { q: "¿Puedo detener las respuestas de IA?", a: "Sí. Tu equipo puede atender directamente y pausar el asistente cuando lo necesite. Probamos sus respuestas con tu información antes de activarlo." },
];

export default function BetaPage() {
  return (
    <>
      <section className="relative isolate overflow-hidden border-b border-border/70 bg-[radial-gradient(circle_at_80%_15%,var(--accent-muted),transparent_38%),linear-gradient(180deg,var(--background),var(--surface))]">
        <div className="pointer-events-none absolute -right-28 top-10 h-72 w-72 rounded-full border border-accent-muted/70 md:h-[30rem] md:w-[30rem]" aria-hidden />
        <div className="pointer-events-none absolute -right-10 top-24 h-48 w-48 rounded-full border border-accent-muted/60 md:h-[24rem] md:w-[24rem]" aria-hidden />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-[1.05fr_.95fr] md:items-center md:gap-12 md:px-6 md:py-24">
          <div className="max-w-xl">
            <span className="inline-flex items-center gap-2 rounded-xl border border-accent-muted bg-accent-subtle px-3 py-1.5 text-xs font-bold uppercase tracking-[0.13em] text-accent-ink"><span className="h-2 w-2 rounded-full bg-accent" /> Beta privada · 10 negocios</span>
            <h1 className="mt-6 font-display text-[clamp(2.7rem,6vw,5.2rem)] font-semibold leading-[1.03] tracking-tight text-foreground">Cada chat puede ser <span className="text-accent-ink">una oportunidad.</span></h1>
            <p className="mt-6 max-w-lg text-lg leading-8 text-muted">Reúne tu WhatsApp, tus clientes y tu equipo en un solo lugar. Un asistente de IA te ayuda a responder con la información de tu negocio, mientras tú mantienes el control.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#solicitar" data-track="cta" data-track-location="beta_hero" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-accent px-6 text-sm font-semibold text-on-accent shadow-md transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong">Solicitar acceso a la beta <ArrowRight size={17} aria-hidden /></a>
              <a href="#como-funciona" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border bg-surface px-6 text-sm font-semibold text-foreground transition-colors hover:bg-surface-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong">Ver cómo funciona</a>
            </div>
            <p className="mt-4 text-sm text-muted">30 días sin costo · Sin tarjeta · Te ayudamos a empezar</p>
          </div>
          <div className="relative mx-auto w-full max-w-lg" aria-label="Ejemplo ilustrativo de una conversación en Colibly">
            <div className="absolute -inset-3 rounded-[28px] bg-accent/10 blur-2xl" aria-hidden />
            <div className="relative overflow-hidden rounded-[22px] border border-border bg-surface shadow-xl">
              <div className="flex items-center gap-3 border-b border-border bg-background px-5 py-4">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-accent-subtle text-accent-ink"><MessageCircle size={19} aria-hidden /></div>
                <div className="min-w-0 flex-1"><p className="text-sm font-semibold">Bandeja de tu equipo</p><p className="text-xs text-muted">Todos saben qué sigue</p></div>
                <span className="rounded-lg bg-success-bg px-2.5 py-1 text-xs font-semibold text-success">En línea</span>
              </div>
              <div className="grid min-h-[290px] grid-cols-[112px_1fr] sm:grid-cols-[158px_1fr]">
                <div className="border-r border-border bg-background/70 p-2 sm:p-3">
                  <p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-wide text-muted">Conversaciones</p>
                  <div className="rounded-xl border border-accent-muted bg-accent-subtle px-2 py-3"><p className="truncate text-xs font-semibold text-foreground">Mariana G.</p><p className="mt-1 truncate text-[11px] text-muted">Quiere una cita</p></div>
                  <div className="mt-2 rounded-xl px-2 py-3"><p className="truncate text-xs font-medium text-foreground">Carlos R.</p><p className="mt-1 truncate text-[11px] text-muted">Pidió precios</p></div>
                  <div className="mt-1 rounded-xl px-2 py-3"><p className="truncate text-xs font-medium text-foreground">Lucía M.</p><p className="mt-1 truncate text-[11px] text-muted">En seguimiento</p></div>
                </div>
                <div className="flex flex-col gap-3 p-3 sm:p-5">
                  <p className="text-[11px] font-semibold text-muted">Mariana G. · WhatsApp</p>
                  <div className="max-w-[88%] self-start rounded-[12px] rounded-tl-sm bg-surface-light px-3 py-2 text-xs leading-5 text-foreground">Hola, ¿tienen horarios para una consulta esta semana?</div>
                  <div className="max-w-[92%] self-end rounded-[12px] rounded-tr-sm bg-accent-subtle px-3 py-2 text-xs leading-5 text-foreground">¡Hola! Tenemos espacios el jueves y viernes. ¿Qué día te funciona mejor?</div>
                  <div className="mt-auto flex flex-wrap gap-1.5"><span className="rounded-lg bg-info-bg px-2 py-1 text-[10px] font-medium text-info">Nueva oportunidad</span><span className="rounded-lg bg-success-bg px-2 py-1 text-[10px] font-medium text-success">Pendiente de agendar</span></div>
                </div>
              </div>
            </div>
            <div className="relative -mt-5 ml-auto mr-3 flex w-fit items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground shadow-lg"><span className="grid h-7 w-7 place-items-center rounded-lg bg-accent-subtle text-accent-ink"><Bot size={15} aria-hidden /></span> Respuesta preparada con IA</div>
            <p className="mt-3 text-center text-xs text-muted">Ejemplo ilustrativo</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-17 md:px-6 md:py-24" aria-labelledby="benefits-title">
        <div className="max-w-2xl"><p className="text-xs font-bold uppercase tracking-[0.15em] text-accent-ink">Lo que cambia</p><h2 id="benefits-title" className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Menos chats perdidos. Más conversaciones que avanzan.</h2><p className="mt-4 text-base leading-7 text-muted">Empieza con lo esencial para atender bien, responder a tiempo y saber a quién dar seguimiento.</p></div>
        <div className="mt-9 grid gap-4 md:grid-cols-3">
          {benefits.map(({ icon: Icon, title: itemTitle, text }) => <article key={itemTitle} className="rounded-[18px] border border-border bg-surface p-6 shadow-sm"><span className="grid h-11 w-11 place-items-center rounded-xl bg-accent-subtle text-accent-ink"><Icon size={21} aria-hidden /></span><h3 className="mt-5 font-display text-xl font-semibold">{itemTitle}</h3><p className="mt-3 text-sm leading-6 text-muted">{text}</p></article>)}
        </div>
      </section>

      <section id="como-funciona" className="scroll-mt-24 border-y border-border bg-surface/70 py-17 md:py-24" aria-labelledby="steps-title">
        <div className="mx-auto max-w-6xl px-4 md:px-6"><div className="max-w-2xl"><p className="text-xs font-bold uppercase tracking-[0.15em] text-accent-ink">Empezar es sencillo</p><h2 id="steps-title" className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Tú conoces tu negocio. Nosotros te ayudamos a ponerlo en marcha.</h2></div>
          <ol className="mt-10 grid gap-4 md:grid-cols-3">{steps.map(({ number, title: stepTitle, text }) => <li key={number} className="rounded-[18px] border border-border bg-background p-6"><span className="font-display text-2xl font-semibold text-accent-ink">{number}</span><h3 className="mt-5 text-lg font-semibold">{stepTitle}</h3><p className="mt-3 text-sm leading-6 text-muted">{text}</p></li>)}</ol>
        </div>
      </section>

      <section id="incluye" className="scroll-mt-24 mx-auto grid max-w-6xl gap-9 px-4 py-17 md:grid-cols-[.9fr_1.1fr] md:items-center md:px-6 md:py-24" aria-labelledby="offer-title">
        <div><p className="text-xs font-bold uppercase tracking-[0.15em] text-accent-ink">La oferta beta</p><h2 id="offer-title" className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Un mes para comprobarlo en tu propio negocio.</h2><p className="mt-5 text-base leading-7 text-muted">Estamos invitando a un grupo pequeño para acompañar cada incorporación y mejorar Colibly con quienes lo usen todos los días.</p><a href="#solicitar" data-track="cta" data-track-location="beta_oferta" className="mt-6 inline-flex min-h-11 items-center gap-2 font-semibold text-accent-ink underline underline-offset-4">Solicitar acceso <ArrowRight size={16} aria-hidden /></a></div>
        <div className="rounded-[22px] border border-accent-muted bg-[linear-gradient(145deg,var(--accent-subtle),var(--surface)_65%)] p-6 shadow-lg sm:p-8"><div className="flex flex-wrap items-center justify-between gap-2"><span className="rounded-lg bg-accent px-3 py-1 text-xs font-bold text-on-accent">BETA PRIVADA</span><span className="text-sm font-semibold text-accent-ink">Primeros 10 negocios</span></div><p className="mt-6 font-display text-5xl font-semibold tracking-tight text-foreground">30 días <span className="text-2xl text-muted">sin costo</span></p><p className="mt-2 text-sm text-muted">La prueba comienza cuando tu espacio quede listo para usar.</p><ul className="mt-7 space-y-3">{["Una cuenta de WhatsApp conectada con nuestra guía", "Hasta tres personas de tu equipo", "Bandeja compartida y seguimiento de clientes", "Un asistente de IA preparado con tu información", "Sesión inicial y dos revisiones durante el mes"].map((item) => <li key={item} className="flex gap-3 text-sm leading-6"><Check size={18} className="mt-0.5 shrink-0 text-success" aria-hidden /><span>{item}</span></li>)}</ul><p className="mt-7 border-t border-border pt-5 text-xs leading-5 text-muted">Sin tarjeta ni cobro automático. El uso de IA y canales tiene los límites de la beta. Algunos mensajes de WhatsApp pueden generar cargos de Meta.</p></div>
      </section>

      <section id="preguntas" className="scroll-mt-24 border-y border-border bg-surface/70 py-17 md:py-24" aria-labelledby="faq-title"><div className="mx-auto grid max-w-6xl gap-8 px-4 md:grid-cols-[.8fr_1.2fr] md:px-6"><div><p className="text-xs font-bold uppercase tracking-[0.15em] text-accent-ink">Sin sorpresas</p><h2 id="faq-title" className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Preguntas frecuentes</h2><p className="mt-4 text-sm leading-6 text-muted">¿Hay algo más que quieras saber? Escríbenos a <a href="mailto:contacto@colibly.com" className="font-medium text-accent-ink underline underline-offset-4">contacto@colibly.com</a>.</p></div><div className="space-y-3">{faq.map(({ q, a }) => <details key={q} data-track="faq" className="group rounded-xl border border-border bg-background px-5 py-4"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold marker:content-none [&::-webkit-details-marker]:hidden">{q}<CircleHelp size={17} className="shrink-0 text-accent-ink" aria-hidden /></summary><p className="pt-3 text-sm leading-6 text-muted">{a}</p></details>)}</div></div></section>

      <section id="solicitar" className="scroll-mt-24 mx-auto grid max-w-6xl gap-10 px-4 py-17 md:grid-cols-[.8fr_1.2fr] md:items-center md:px-6 md:py-24" aria-labelledby="apply-title"><div><p className="text-xs font-bold uppercase tracking-[0.15em] text-accent-ink">Tu siguiente paso</p><h2 id="apply-title" className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Empecemos por conocer tu negocio.</h2><p className="mt-5 text-base leading-7 text-muted">Solicitar acceso toma menos de dos minutos. Te contactaremos personalmente para confirmar si la beta encaja contigo y ayudarte a empezar.</p><div className="mt-7 flex items-start gap-3 text-sm text-muted"><ShieldCheck size={20} className="shrink-0 text-accent-ink" aria-hidden /><p>Tú mantienes el control de tu número y decides qué información usa el asistente.</p></div></div><BetaApplicationForm /></section>
    </>
  );
}
