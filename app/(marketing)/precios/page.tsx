import { appUrl } from "@/lib/app-url";
import type { Metadata } from "next";
import { Check, X } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
import { cn } from "@/app/components/ui/cn";
import { BRAND_NAME } from "@/lib/brand";
import { formatMxn, GRACE_DAYS, PLAN_LIST, PRICE_CURRENCY_NOTE, PRICE_TAX_NOTE, PRICE_UNIT, TRIAL_DAYS, TRIAL_MAX_SEATS, TRIAL_POOL_TEXT } from "@/lib/billing/plans";
import { COEXISTENCE_PITCH, META_FEES_NOTE, planFeatures } from "@/lib/billing/plan-features";
import { InfoPage, LINK } from "../_page";

const DESCRIPTION = `Planes y precios de ${BRAND_NAME}: Esencial, Negocio y Pro, en pesos mexicanos por ejecutivo al mes. Crea tu cuenta y prueba ${TRIAL_DAYS} días gratis, sin tarjeta.`;

export const metadata: Metadata = {
  title: "Planes y precios",
  description: DESCRIPTION,
  alternates: { canonical: "/precios" },
  openGraph: { type: "website", locale: "es_MX", siteName: BRAND_NAME, url: "/precios", title: `Planes y precios · ${BRAND_NAME}`, description: DESCRIPTION },
};

// Precios y límites salen de lib/billing/plans.ts (único lugar para cambiarlos):
// esta página, la landing, los términos y la pantalla de plan siempre coinciden.
export default function PricingPage() {
  return (
    <InfoPage
      title="Planes y precios"
      intro={`Pagas por ejecutivo. ${COEXISTENCE_PITCH} Crea tu cuenta y prueba ${BRAND_NAME} ${TRIAL_DAYS} días gratis con el plan Pro para hasta ${TRIAL_MAX_SEATS} ejecutivos, sin tarjeta y sin cobros automáticos. Al terminar, tú eliges el plan y cuántos ejecutivos pagar.`}
    >
      <div className="grid gap-5 md:grid-cols-3">
        {PLAN_LIST.map((plan) => {
          const featured = plan.id === "PRO";
          return (
            <div
              key={plan.id}
              className={cn("flex flex-col rounded-xl border p-6 shadow-sm", featured ? "border-accent-strong bg-accent-subtle ring-1 ring-accent-strong" : "border-border bg-surface")}
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="!mt-0 font-display text-xl font-semibold">{plan.name}</h2>
                {plan.badge && <Badge tone="accent" size="sm">{plan.badge}</Badge>}
              </div>
              <p className="mt-1 text-sm text-muted">{plan.tagline}</p>
              <p className="mt-5">
                <span className="font-display text-hero leading-none tabular-nums">{formatMxn(plan.pricePerSeatMxn)}</span>
                <span className="text-sm text-muted"> {PRICE_UNIT}{PRICE_TAX_NOTE ? ` · ${PRICE_TAX_NOTE}` : ""}</span>
              </p>
              <ul className="mt-5 flex-1 space-y-2.5 text-sm">
                {planFeatures(plan).map((f) => (
                  <li key={f.text} className={cn("!ml-0 flex list-none items-start gap-2", !f.included && "text-muted")}>
                    {f.included ? <Check size={16} className="mt-0.5 shrink-0 text-accent-ink" aria-hidden /> : <X size={16} className="mt-0.5 shrink-0" aria-hidden />}
                    <span>{!f.included && <span className="sr-only">No incluye: </span>}{f.text}</span>
                  </li>
                ))}
              </ul>
              <Button href="/register" variant={featured ? "primary" : "secondary"} size="lg" fullWidth className="mt-6" data-track="cta" data-track-location={`precios_${plan.id.toLowerCase()}`}>
                Prueba {TRIAL_DAYS} días gratis
              </Button>
            </div>
          );
        })}
      </div>

      <h2>Lo que conviene saber</h2>
      <ul>
        <li>Un ejecutivo es cada persona de tu equipo que puede atender conversaciones, incluido quien crea la cuenta y los administradores. Las invitaciones pendientes también ocupan un asiento. Puedes agregar o quitar ejecutivos cuando quieras; el cambio se prorratea.</li>
        <li>Cada ejecutivo conecta 1 número de WhatsApp; en Negocio y Pro, también, por habilitación, 1 cuenta de Telegram, de Messenger y de Instagram, y el chat web. Esencial es solo WhatsApp, sin IA y para hasta 3 ejecutivos. Contactos y créditos de IA se suman por ejecutivo en una bolsa para todo tu equipo; las automatizaciones y la API dependen del plan (<a href={appUrl("/docs/api")} className="font-medium text-accent-ink underline underline-offset-2">documentación de la API</a>).</li>
        <li>La prueba de {TRIAL_DAYS} días incluye el plan Pro para hasta {TRIAL_MAX_SEATS} ejecutivos, con {TRIAL_POOL_TEXT}, y no pide tarjeta. Al terminar, si no eliges un plan, tu cuenta pasa a solo lectura ese mismo día (la prueba no tiene días de gracia) y tus datos se conservan.</li>
        <li>{PRICE_CURRENCY_NOTE} Los precios son por ejecutivo, se cobran cada mes con tarjeta a través de Stripe y la suscripción se renueva hasta que la cancelas.</li>
        <li>En Negocio y Pro la IA ya viene incluida: no necesitas contratar ni configurar una IA por tu cuenta.</li>
        <li>Si ya pagaste y un cobro falla, tienes {GRACE_DAYS} días de gracia con todo funcionando antes de pasar a solo lectura.</li>
        <li>{META_FEES_NOTE}</li>
      </ul>
      <p className="rounded-xl border border-border bg-surface p-4 text-sm text-muted-strong">
        <strong className="text-foreground">Precios sujetos a ajuste.</strong> Los precios finales pueden ajustarse. Si cambian, te avisamos con al
        menos 30 días de anticipación y el cambio aplica a partir de tu siguiente periodo, como indican los{" "}
        <a href="/terminos" className={LINK}>Términos y condiciones</a>.
      </p>
      <p>¿Dudas sobre qué plan te conviene? <a href="/contacto" className={LINK}>Escríbenos</a>.</p>
    </InfoPage>
  );
}
