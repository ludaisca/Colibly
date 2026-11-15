import type { Metadata } from "next";
import { Button } from "@/app/components/ui/button";
import { appUrl, siteUrl } from "@/lib/app-url";
import { BRAND_NAME } from "@/lib/brand";
import { breadcrumbJson } from "@/lib/seo/site-schema";
import { comparativasUpdated } from "@/lib/seo/public-pages";
import { HUB } from "../_comparativas-data";
import { Rich } from "../_guide-page";
import { GUIDES, guidePath, monthYearEs } from "../_guides";
import { InfoPage, LINK } from "../_page";

export const metadata: Metadata = {
  title: HUB.title,
  description: HUB.description,
  alternates: { canonical: "/comparativas" },
  openGraph: { type: "website", locale: "es_MX", siteName: BRAND_NAME, url: "/comparativas", title: `${HUB.title} · ${BRAND_NAME}`, description: HUB.description },
};

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-border">
      <table className={`w-full ${headers.length > 4 ? "min-w-[48rem]" : "min-w-[34rem]"} border-collapse text-left text-sm`}>
        <thead className="bg-surface">
          <tr>{headers.map((h) => <th key={h} className="border-b border-border px-3 py-2 font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[0]}>{row.map((c, i) => <td key={i} className={`border-b border-border px-3 py-2 align-top ${i === 0 ? "font-medium" : ""}`}><Rich text={c} /></td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ComparativasIndexPage() {
  const list = GUIDES.filter((g) => g.section === "comparativas");
  const itemList = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: HUB.title,
    itemListElement: list.map((g, i) => ({ "@type": "ListItem", position: i + 1, url: siteUrl(guidePath(g)), name: g.h1 })),
  }).replace(/</g, "\\u003c");
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: breadcrumbJson([{ name: "Comparativas", path: "/comparativas" }]) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: itemList }} />
      <InfoPage title={HUB.h1} intro={HUB.intro}>
        <section>
          <h2>{HUB.equivalence.heading}</h2>
          <Table {...HUB.equivalence.table} />
        </section>
        <section>
          <h2>{HUB.billing.heading}</h2>
          <Table {...HUB.billing.table} />
        </section>
        <section>
          <h2>{HUB.listHeading}</h2>
          <ul className="!space-y-4">
            {list.map((g) => (
              <li key={g.slug} className="!ml-0 !list-none">
                <a href={guidePath(g)} className={`${LINK} text-lg font-semibold`}>{g.title}</a>
                <p className="mt-1 text-pretty text-muted">{g.description}</p>
              </li>
            ))}
          </ul>
          <p className="mt-4">{HUB.closing}</p>
        </section>

        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-5">
          <p className="min-w-0 flex-1 text-pretty font-medium">{HUB.cta}</p>
          <Button href={appUrl("/register")}>Crear mi cuenta</Button>
        </div>

        <section>
          <h2>Sigue leyendo</h2>
          <ul className="mt-3">
            {HUB.links.map((l) => (
              <li key={l.href}><a href={l.href} className={LINK}>{l.label}</a></li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-muted">Última actualización: {monthYearEs(comparativasUpdated())}</p>
        </section>
      </InfoPage>
    </>
  );
}
