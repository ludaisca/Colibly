import { siteUrl } from "@/lib/app-url";
import { BRAND_NAME } from "@/lib/brand";
import { getPublicPages } from "@/lib/seo/public-pages";
import { siteIntro } from "@/lib/seo/site-facts";

// Dinámico a propósito (no en build): las URLs salen de SITE_URL en runtime y
// los posts programados deben aparecer solos al llegar su fecha, sin un deploy.
// El contenido se arma desde las mismas fuentes que las páginas
// (lib/seo/public-pages.ts) y se cachea una hora.
export const dynamic = "force-dynamic";

export async function GET() {
  const pages = await getPublicPages();
  const parts = [
    `# ${BRAND_NAME} — contenido completo`,
    siteIntro(),
    `Este archivo reúne, en Markdown, el texto de las páginas públicas de ${siteUrl("/")} (inicio, precios, guías, comparativas y blog). El resumen con enlaces está en ${siteUrl("/llms.txt")}.`,
    ...pages.map((p) => `---\n\nFuente: ${siteUrl(p.path)}\n\n${p.markdown.trim()}`),
  ];
  return new Response(parts.join("\n\n") + "\n", { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
