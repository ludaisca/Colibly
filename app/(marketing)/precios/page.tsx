import { appUrl } from "@/lib/app-url";
import type { Metadata } from "next";
import { BRAND_NAME } from "@/lib/brand";
import {
  GRACE_DAYS,
  PRICE_CURRENCY_NOTE,
  TRIAL_DAYS,
  TRIAL_MAX_SEATS,
  TRIAL_POOL_TEXT,
} from "@/lib/billing/plans";
import { COEXISTENCE_PITCH, META_FEES_NOTE } from "@/lib/billing/plan-features";
import { LINK } from "../_page";
import { PlanCards } from "../_plan-cards";
import { PricingTools } from "../_pricing-tools";

const DESCRIPTION = `Planes y precios de ${BRAND_NAME}: Esencial, Negocio y Pro, en pesos mexicanos por ejecutivo al mes. Crea tu cuenta y prueba ${TRIAL_DAYS} días gratis, sin tarjeta.`;
const CTA = `Prueba ${TRIAL_DAYS} días gratis`;

export const metadata: Metadata = {
  title: "Planes y precios",
  description: DESCRIPTION,
  alternates: { canonical: "/precios" },
  openGraph: {
    type: "website",
    locale: "es_MX",
    siteName: BRAND_NAME,
    url: "/precios",
    title: `Planes y precios · ${BRAND_NAME}`,
    description: DESCRIPTION,
  },
};

// Página canónica de precios (nav, pie, términos, SEO). La landing solo resume
// las 3 cards y enlaza aquí para calculadora, matriz y notas.
export default function PricingPage() {
  return (
    <div>
      <header className="mx-auto max-w-3xl px-4 pt-10 text-center sm:pt-12 md:px-6 md:pt-16">
        <h1 className="text-balance font-display text-page-title font-semibold tracking-tight sm:text-4xl">
          Planes y precios
        </h1>
        <p className="mt-4 text-pretty text-base leading-relaxed text-muted sm:text-lg">
          Pagas por ejecutivo. {COEXISTENCE_PITCH} Prueba {TRIAL_DAYS} días gratis con Pro (hasta{" "}
          {TRIAL_MAX_SEATS} ejecutivos), sin tarjeta.
        </p>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10 md:px-6 md:py-14">
        <PlanCards cta={CTA} trackPrefix="precios" titleAs="h2" />
        <PricingTools registerCta={CTA} />
      </div>

      <section className="border-t border-border/60 bg-surface">
        <div className="mx-auto max-w-3xl px-4 py-10 sm:py-12 md:px-6 md:py-16">
          <h2 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
            Lo que conviene saber
          </h2>
          <ul className="mt-6 space-y-3 text-[15px] leading-relaxed text-foreground/90">
            <li className="flex gap-2.5">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent-strong" aria-hidden />
              <span className="min-w-0 text-pretty">
                Un ejecutivo es cada persona que atiende conversaciones (dueño y admins incluidos). Las
                invitaciones pendientes también ocupan asiento. Puedes agregar o quitar cuando quieras; se
                prorratea.
              </span>
            </li>
            <li className="flex gap-2.5">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent-strong" aria-hidden />
              <span className="min-w-0 text-pretty">
                Cada ejecutivo conecta 1 WhatsApp; en Negocio y Pro, por habilitación, también 1 Telegram, 1
                Messenger, 1 Instagram y el chat web. Esencial es solo WhatsApp, sin IA, hasta 3 ejecutivos.
                Contactos y créditos de IA se suman por ejecutivo; automatizaciones y API dependen del plan (
                <a href={appUrl("/docs/api")} className="font-medium text-accent-ink underline underline-offset-2">
                  API
                </a>
                ).
              </span>
            </li>
            <li className="flex gap-2.5">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent-strong" aria-hidden />
              <span className="min-w-0 text-pretty">
                La prueba de {TRIAL_DAYS} días incluye Pro para hasta {TRIAL_MAX_SEATS} ejecutivos, con{" "}
                {TRIAL_POOL_TEXT}, sin tarjeta. Si no eliges plan al terminar, la cuenta pasa a solo lectura ese
                mismo día.
              </span>
            </li>
            <li className="flex gap-2.5">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent-strong" aria-hidden />
              <span className="min-w-0 text-pretty">
                {PRICE_CURRENCY_NOTE} Cobro mensual con tarjeta vía Stripe. En Negocio y Pro la IA ya viene
                incluida.
              </span>
            </li>
            <li className="flex gap-2.5">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent-strong" aria-hidden />
              <span className="min-w-0 text-pretty">
                Si un cobro falla tras haber pagado, tienes {GRACE_DAYS} días de gracia. {META_FEES_NOTE}
              </span>
            </li>
          </ul>

          <p className="mt-8 rounded-xl border border-border bg-background p-4 text-pretty text-sm text-muted-strong">
            <strong className="text-foreground">Precios sujetos a ajuste.</strong> Si cambian, te avisamos con al
            menos 30 días de anticipación; aplica en el siguiente periodo, según los{" "}
            <a href="/terminos" className={LINK}>
              Términos y condiciones
            </a>
            .
          </p>
          <p className="mt-6 text-pretty text-sm text-muted">
            ¿Dudas sobre qué plan te conviene?{" "}
            <a href="/contacto" className={LINK}>
              Escríbenos
            </a>
            .
          </p>
        </div>
      </section>
    </div>
  );
}
