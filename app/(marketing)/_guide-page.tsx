import type { Metadata } from "next";
import { BRAND_NAME } from "@/lib/brand";
import { appUrl, siteUrl } from "@/lib/app-url";
import { TRIAL_DAYS } from "@/lib/billing/plans";
import { Button } from "@/app/components/ui/button";
import { breadcrumbJson } from "@/lib/seo/site-schema";
import { guideBySlug } from "./_guides";
import { InfoPage, LINK } from "./_page";

export function guideMetadata(slug: string): Metadata {
  const g = guideBySlug(slug);
  return {
    title: g.title,
    description: g.description,
    alternates: { canonical: `/${g.slug}` },
    openGraph: { type: "article", locale: "es_MX", siteName: BRAND_NAME, url: `/${g.slug}`, title: `${g.title} · ${BRAND_NAME}`, description: g.description },
  };
}

function faqJson(slug: string): string {
  const g = guideBySlug(slug);
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: g.faq.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  }).replace(/</g, "\\u003c");
}

function articleJson(slug: string): string {
  const g = guideBySlug(slug);
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: g.h1,
    description: g.description,
    inLanguage: "es-MX",
    mainEntityOfPage: siteUrl(`/${g.slug}`),
    dateModified: g.updated,
    author: { "@id": siteUrl("/#organization") },
    publisher: { "@id": siteUrl("/#organization") },
  }).replace(/</g, "\\u003c");
}

export function GuidePage({ slug }: { slug: string }) {
  const g = guideBySlug(slug);
  const related = g.related.map((s) => guideBySlug(s));
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: breadcrumbJson([{ name: g.title, path: `/${g.slug}` }]) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqJson(slug) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: articleJson(slug) }} />
      <InfoPage title={g.h1} intro={g.intro}>
        {g.sections.map((s) => (
          <section key={s.heading}>
            <h2>{s.heading}</h2>
            {s.paragraphs?.map((p) => (
              <p key={p} className="mt-3">{p}</p>
            ))}
            {s.bullets && (
              <ul className="mt-3">
                {s.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            )}
          </section>
        ))}

        <section>
          <h2>Preguntas frecuentes</h2>
          <dl className="mt-3 space-y-4">
            {g.faq.map(({ q, a }) => (
              <div key={q}>
                <dt className="font-semibold">{q}</dt>
                <dd className="mt-1 text-pretty text-foreground/90">{a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-5">
          <p className="min-w-0 flex-1 text-pretty font-medium">Prueba {BRAND_NAME} {TRIAL_DAYS} días, sin tarjeta.</p>
          <Button href={appUrl("/register")}>Crear mi cuenta</Button>
        </div>

        <section>
          <h2>Sigue leyendo</h2>
          <ul className="mt-3">
            {related.map((r) => (
              <li key={r.slug}><a href={`/${r.slug}`} className={LINK}>{r.title}</a></li>
            ))}
            <li><a href="/guias" className={LINK}>Todas las guías</a></li>
            <li><a href="/precios" className={LINK}>Planes y precios</a></li>
          </ul>
        </section>
      </InfoPage>
    </>
  );
}
