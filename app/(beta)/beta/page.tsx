import type { Metadata } from "next";
import { connection } from "next/server";
import { ArrowRight, Bot, Check, ChevronDown, MessageCircle, ShieldCheck } from "lucide-react";
import { BRAND_CONTACT_EMAIL, BRAND_NAME } from "@/lib/brand";
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

const conversation = [
  { moment: "Cuando preguntan", title: "La consulta queda a la vista", text: "Tu equipo ve el mensaje en la misma bandeja, aunque atiendan varias personas." },
  { moment: "Cuando respondes", title: "El contexto acompaña la respuesta", text: "Tienes a mano lo que pidió el cliente; el asistente usa tus servicios y preguntas frecuentes si decides activarlo." },
  { moment: "Cuando vuelve", title: "Sabes qué falta por resolver", text: "Asigna la conversación y retoma la cita o la cotización sin empezar de cero." },
];

const steps = [
  { number: "01", title: "Nos cuentas cómo atiendes", text: "Una conversación breve para conocer tu negocio, tus clientes y lo que te gustaría mejorar." },
  { number: "02", title: "Conectamos y probamos contigo", text: "Te guiamos para conectar WhatsApp, agregar a tu equipo y probar las respuestas antes de activar el asistente." },
  { number: "03", title: "Tu equipo empieza; seguimos cerca", text: "Usas Colibly con clientes reales. Durante el primer mes revisamos contigo qué funciona y qué debemos ajustar." },
];

const faq = [
  { q: "¿Necesito saber de tecnología para empezar?", a: "No. Te acompañamos en la conexión y la configuración inicial. Necesitarás tener control de tu número y autorizar la conexión desde tu cuenta de Meta (la empresa dueña de WhatsApp)." },
  { q: "¿Cuándo comienzan los 30 días?", a: "Cuando tu cuenta esté preparada para usarla. Coordinaremos contigo la fecha de activación antes de empezar la prueba." },
  { q: "¿Me cobrarán al terminar?", a: "No habrá cobro automático por la beta ni pedimos tarjeta para solicitar acceso. Antes de terminar, podrás decidir si continúas con uno de los planes disponibles." },
  { q: "¿Cuánto costará después de la beta?", a: "Antes de que termine tu prueba te mostraremos el precio y las condiciones del plan para que decidas si quieres continuar. Solicitar acceso no activa un cobro." },
  { q: "¿Puedo usar mi número actual?", a: "Revisaremos contigo si tu número cumple los requisitos de conexión de WhatsApp y de Meta. Tú conservas el control del número y autorizas la conexión." },
  { q: "¿Hay algún otro costo por usar WhatsApp?", a: "Meta puede cobrar algunos mensajes de WhatsApp según el tipo de mensaje y el destino. Te ayudaremos a entenderlo antes de conectar tu número; esos cargos son independientes de Colibly." },
  { q: "¿Puedo detener las respuestas de IA?", a: "Sí. Tu equipo puede atender directamente y pausar el asistente cuando lo necesite. Probamos sus respuestas con tu información antes de activarlo." },
];

export default function BetaPage() {
  return (
    <>
      <section className="relative isolate overflow-hidden border-b border-border bg-background">
        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-[1.05fr_.95fr] md:items-center md:gap-12 md:px-6 md:py-24">
          <div className="max-w-xl">
            <h1 className="font-display text-[clamp(2.15rem,5vw,4rem)] font-semibold leading-[1.06] tracking-tight text-foreground text-balance">Vende por WhatsApp <span className="text-accent-ink">sin perder conversaciones.</span></h1>
            <p className="mt-6 max-w-lg text-lg leading-8 text-muted">Si vendes servicios por WhatsApp, {BRAND_NAME} reúne las consultas de tu equipo y el seguimiento de cada cliente. Te ayudamos a configurar un asistente con la información de tu negocio; tú decides cuándo responde.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#solicitar" data-track="cta" data-track-location="beta_hero" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-accent px-6 text-sm font-semibold text-on-accent shadow-md transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong">Solicitar acceso a la beta <ArrowRight size={17} aria-hidden /></a>
              <a href="#como-funciona" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border bg-surface px-6 text-sm font-semibold text-foreground transition-colors hover:bg-surface-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong">Ver cómo funciona</a>
            </div>
            <p className="mt-4 text-sm text-muted">30 días sin costo · Sin tarjeta · Te ayudamos a empezar</p>
          </div>
          <div className="relative mx-auto w-full max-w-lg" role="img" aria-label="Ejemplo ilustrativo de una conversación en Colibly: la bandeja del equipo con tres chats y una respuesta preparada con IA">
            <div className="relative overflow-hidden rounded-[22px] bg-surface shadow-xl">
              <div className="flex items-center gap-3 border-b border-border bg-background px-5 py-4">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-accent-subtle text-accent-ink"><MessageCircle size={19} aria-hidden /></div>
                <div className="min-w-0 flex-1"><p className="text-sm font-semibold">Bandeja de tu equipo</p><p className="text-xs text-muted">Todos saben qué sigue</p></div>
                <span className="rounded-lg bg-success-bg px-2.5 py-1 text-xs font-semibold text-success">En línea</span>
              </div>
              <div className="grid min-h-[290px] grid-cols-[112px_1fr] sm:grid-cols-[158px_1fr]">
                <div className="border-r border-border bg-background/70 p-2 sm:p-3">
                  <p className="px-2 pb-2 text-xs font-bold uppercase tracking-wide text-muted">Chats</p>
                  <div className="rounded-xl border border-accent-muted bg-accent-subtle px-2 py-3"><p className="truncate text-xs font-semibold text-foreground">Mariana G.</p><p className="mt-1 truncate text-xs text-muted">Quiere una cita</p></div>
                  <div className="mt-2 rounded-xl px-2 py-3"><p className="truncate text-xs font-medium text-foreground">Carlos R.</p><p className="mt-1 truncate text-xs text-muted">Pidió precios</p></div>
                  <div className="mt-1 rounded-xl px-2 py-3"><p className="truncate text-xs font-medium text-foreground">Lucía M.</p><p className="mt-1 truncate text-xs text-muted">En seguimiento</p></div>
                </div>
                <div className="flex flex-col gap-3 p-3 pb-8 sm:p-5 sm:pb-8">
                  <p className="text-xs font-semibold text-muted">Mariana G. · WhatsApp</p>
                  <div className="max-w-[88%] self-start rounded-[12px] rounded-tl-sm bg-surface-light px-3 py-2 text-xs leading-5 text-foreground">Hola, ¿tienen horarios para una consulta esta semana?</div>
                  <div className="max-w-[92%] self-end rounded-[12px] rounded-tr-sm bg-accent-subtle px-3 py-2 text-xs leading-5 text-foreground">¡Hola! Tenemos espacios el jueves y viernes. ¿Qué día te funciona mejor?</div>
                  <div className="mt-auto flex flex-wrap gap-1.5"><span className="rounded-lg bg-info-bg px-2 py-1 text-xs font-medium text-info">Nueva oportunidad</span><span className="rounded-lg bg-success-bg px-2 py-1 text-xs font-medium text-success">Pendiente de agendar</span></div>
                </div>
              </div>
            </div>
            <div className="relative -mt-5 ml-auto mr-3 flex w-fit items-center gap-2 rounded-xl bg-surface px-3 py-2 text-xs font-medium text-foreground shadow-lg"><Bot size={15} className="text-accent-ink" aria-hidden /> Respuesta preparada con IA</div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-17 md:px-6 md:py-24" aria-labelledby="benefits-title">
        <div className="grid gap-10 md:grid-cols-[.8fr_1.2fr] md:gap-16">
          <div className="max-w-md"><h2 id="benefits-title" className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">De la primera pregunta al siguiente paso.</h2><p className="mt-5 text-base leading-7 text-muted">Una persona pregunta por una cita. Otra pide precios. Tu equipo puede atender ambas sin perder lo que ya se habló.</p></div>
          <div className="divide-y divide-border border-y border-border">
            {conversation.map(({ moment, title: itemTitle, text }) => <div key={moment} className="grid gap-2 py-6 sm:grid-cols-[9rem_1fr] sm:gap-5"><p className="text-sm font-semibold text-accent-ink">{moment}</p><div><h3 className="font-display text-xl font-semibold">{itemTitle}</h3><p className="mt-2 max-w-[62ch] text-sm leading-6 text-muted">{text}</p></div></div>)}
          </div>
        </div>
      </section>

      <section id="como-funciona" className="scroll-mt-24 border-y border-border bg-surface/70 py-17 md:py-24" aria-labelledby="steps-title">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 md:grid-cols-[.8fr_1.2fr] md:gap-16 md:px-6"><div className="max-w-md"><h2 id="steps-title" className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">La configuración la hacemos contigo.</h2><p className="mt-5 text-base leading-7 text-muted">No tienes que descubrir solo cómo conectar tu número ni activar respuestas sin probarlas.</p></div>
          <ol className="divide-y divide-border border-y border-border">{steps.map(({ number, title: stepTitle, text }) => <li key={number} className="flex gap-5 py-6"><span className="min-w-9 font-display text-xl font-semibold tabular-nums text-accent-ink" aria-hidden>{number}</span><div><h3 className="text-lg font-semibold">{stepTitle}</h3><p className="mt-2 max-w-[62ch] text-sm leading-6 text-muted">{text}</p></div></li>)}</ol>
        </div>
      </section>

      <section id="incluye" className="scroll-mt-24 mx-auto grid max-w-6xl gap-9 px-4 py-17 md:grid-cols-[.9fr_1.1fr] md:items-center md:px-6 md:py-24" aria-labelledby="offer-title">
        <div><h2 id="offer-title" className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Un mes para comprobarlo en tu propio negocio.</h2><p className="mt-5 text-base leading-7 text-muted">Estamos invitando a un grupo pequeño para acompañar cada incorporación y mejorar Colibly con quienes lo usen todos los días.</p><a href="#solicitar" data-track="cta" data-track-location="beta_oferta" className="mt-6 inline-flex min-h-11 items-center gap-2 font-semibold text-accent-ink underline underline-offset-4">Solicitar acceso <ArrowRight size={16} aria-hidden /></a></div>
        <div className="rounded-[22px] bg-accent-subtle p-6 shadow-lg sm:p-8"><div className="flex flex-wrap items-center justify-between gap-2"><span className="rounded-lg bg-accent px-3 py-1 text-xs font-bold text-on-accent">BETA PRIVADA</span><span className="text-sm font-semibold text-accent-ink">Primeros 10 negocios</span></div><p className="mt-6 font-display text-5xl font-semibold tracking-tight text-foreground">30 días <span className="text-2xl text-muted">sin costo</span></p><p className="mt-2 text-sm text-muted">La prueba comienza cuando tu espacio quede listo para usar.</p><ul className="mt-7 space-y-3">{["Una cuenta de WhatsApp conectada con nuestra guía", "Hasta tres personas de tu equipo", "Bandeja compartida y seguimiento de clientes", "Un asistente de IA preparado con tu información", "Sesión inicial y dos revisiones durante el mes"].map((item) => <li key={item} className="flex gap-3 text-sm leading-6"><Check size={18} className="mt-0.5 shrink-0 text-success" aria-hidden /><span>{item}</span></li>)}</ul><p className="mt-7 border-t border-border pt-5 text-xs leading-5 text-muted">Sin tarjeta ni cobro automático. El uso de IA y canales tiene los límites de la beta. Algunos mensajes de WhatsApp pueden generar cargos de Meta.</p></div>
      </section>

      <section id="preguntas" className="scroll-mt-24 border-y border-border bg-surface/70 py-17 md:py-24" aria-labelledby="faq-title"><div className="mx-auto grid max-w-6xl gap-8 px-4 md:grid-cols-[.8fr_1.2fr] md:px-6"><div><h2 id="faq-title" className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Preguntas frecuentes</h2><p className="mt-4 text-sm leading-6 text-muted">¿Hay algo más que quieras saber? Escríbenos a <a href={`mailto:${BRAND_CONTACT_EMAIL}`} className="font-medium text-accent-ink underline underline-offset-4">{BRAND_CONTACT_EMAIL}</a>.</p></div><div className="space-y-3">{faq.map(({ q, a }) => <details key={q} data-track="faq" className="group rounded-xl border border-border bg-background"><summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-xl px-5 py-4 font-semibold marker:content-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong [&::-webkit-details-marker]:hidden">{q}<ChevronDown size={18} className="shrink-0 text-accent-ink motion-safe:transition-transform group-open:rotate-180" aria-hidden /></summary><p className="max-w-[65ch] px-5 pb-4 text-sm leading-6 text-muted">{a}</p></details>)}</div></div></section>

      <section id="solicitar" className="scroll-mt-24 mx-auto grid max-w-6xl gap-10 px-4 py-17 md:grid-cols-[.8fr_1.2fr] md:items-center md:px-6 md:py-24" aria-labelledby="apply-title"><div><h2 id="apply-title" className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Empecemos por conocer tu negocio.</h2><p className="mt-5 text-base leading-7 text-muted">Solicitar acceso toma menos de dos minutos. Te contactaremos personalmente para confirmar si la beta encaja contigo y ayudarte a empezar.</p><div className="mt-7 flex items-start gap-3 text-sm text-muted"><ShieldCheck size={20} className="shrink-0 text-accent-ink" aria-hidden /><p>Tú mantienes el control de tu número y decides qué información usa el asistente.</p></div></div><BetaApplicationForm /></section>
    </>
  );
}
