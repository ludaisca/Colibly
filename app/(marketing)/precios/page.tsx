import { appUrl } from "@/lib/app-url";
import type { Metadata } from "next";
import { BRAND_NAME } from "@/lib/brand";
import { TRIAL_DAYS } from "@/lib/billing/plans";
import { TRIAL_AI_CREDITS_PER_USER, TRIAL_MAX_USERS } from "@/lib/billing/licenses";
import { META_FEES_NOTE } from "@/lib/billing/plan-features";
import { LINK } from "../_page";
import { LandingOffer } from "../_landing-offer";
import { NOTES } from "../_pricing-notes";
import { breadcrumbJson } from "@/lib/seo/site-schema";

const DESCRIPTION = `Planes y precios de ${BRAND_NAME}: Básico $59, Avanzado $89 y Pro $149 MXN por usuario al mes. Empresarial a la medida. Prueba ${TRIAL_DAYS} días gratis, sin tarjeta.`;
const CTA = `Prueba ${TRIAL_DAYS} días de Pro`;

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

export default function PricingPage() {
  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: breadcrumbJson([{ name: "Planes y precios", path: "/precios" }]) }} />
      <header className="mx-auto max-w-6xl px-4 pt-10 sm:pt-12 md:px-6 md:pt-16">
        <h1 className="text-balance font-display text-[2.75rem] font-bold leading-[0.98] tracking-[-0.015em] sm:text-6xl">
          Planes y precios.
        </h1>
        <p className="mt-4 max-w-2xl text-pretty text-base leading-relaxed text-muted sm:text-lg">
          Cada persona de tu equipo paga una licencia, cada mes, en pesos: Básico $59, Avanzado $89 o Pro $149, y
          puedes mezclarlas. Empresarial es a la medida. Prueba {TRIAL_DAYS} días, sin tarjeta.
        </p>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10 md:px-6 md:py-14">
        <LandingOffer cta={CTA} compare />
      </div>

      <section className="border-t border-border bg-surface">
        <div className="mx-auto max-w-3xl px-4 py-10 sm:py-12 md:px-6 md:py-16">
          <h2 className="font-display text-3xl font-bold leading-tight sm:text-4xl">
            Lo que conviene saber
          </h2>
          <ul className="mt-6 space-y-3 text-[15px] leading-relaxed text-foreground/90">
            {NOTES.map((note) => (
              <li key={note} className="flex gap-2.5">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-foreground" aria-hidden />
                <span className="min-w-0 text-pretty">{note}</span>
              </li>
            ))}
            <li className="flex gap-2.5">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-foreground" aria-hidden />
              <span className="min-w-0 text-pretty">
                La prueba de {TRIAL_DAYS} días es para hasta {TRIAL_MAX_USERS} personas, todas con licencia Pro y{" "}
                {TRIAL_AI_CREDITS_PER_USER.toLocaleString("es-MX")} créditos de IA cada una, sin tarjeta. La API (licencia Pro) está documentada en{" "}
                <a href={appUrl("/docs/api")} className="font-medium text-accent-ink underline underline-offset-2">
                  la referencia para desarrolladores
                </a>
                .
              </span>
            </li>
            <li className="flex gap-2.5">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-foreground" aria-hidden />
              <span className="min-w-0 text-pretty">{META_FEES_NOTE}</span>
            </li>
          </ul>

          <p className="mt-8 rounded-xl border border-border bg-background p-4 text-pretty text-sm text-muted">
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
