import type { Metadata } from "next";
import { BRAND_NAME } from "@/lib/brand";
import { breadcrumbJson } from "@/lib/seo/site-schema";
import { GUIDES } from "../_guides";
import { InfoPage, LINK } from "../_page";

const DESCRIPTION = `Guías de ${BRAND_NAME} sobre CRM para WhatsApp, chatbots de IA, la API de WhatsApp Business, citas y automatización, con ejemplos por tipo de negocio.`;

export const metadata: Metadata = {
  title: "Guías de WhatsApp para tu negocio",
  description: DESCRIPTION,
  alternates: { canonical: "/guias" },
  openGraph: { type: "website", locale: "es_MX", siteName: BRAND_NAME, url: "/guias", title: `Guías de WhatsApp para tu negocio · ${BRAND_NAME}`, description: DESCRIPTION },
};

export default function GuidesIndexPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: breadcrumbJson([{ name: "Guías", path: "/guias" }]) }} />
      <InfoPage title="Guías de WhatsApp para tu negocio" intro="Respuestas claras sobre cómo atender, vender y automatizar por WhatsApp y otros canales.">
        <ul className="!space-y-4">
          {GUIDES.map((g) => (
            <li key={g.slug} className="!ml-0 !list-none">
              <a href={`/${g.slug}`} className={`${LINK} text-lg font-semibold`}>{g.title}</a>
              <p className="mt-1 text-pretty text-muted-strong">{g.description}</p>
            </li>
          ))}
        </ul>
      </InfoPage>
    </>
  );
}
