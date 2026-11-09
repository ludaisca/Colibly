import { appUrl, siteUrl } from "@/lib/app-url";
import { BRAND_NAME } from "@/lib/brand";
import { GUIDES, guidePath } from "@/app/(marketing)/_guides";
import { getPublishedPosts } from "@/lib/blog/posts";
import { keyFacts, siteIntro } from "@/lib/seo/site-facts";

// Dinámico: las URLs salen de SITE_URL/APP_URL en runtime y los posts
// programados entran solos cuando llega su fecha.
export const dynamic = "force-dynamic";

// Resumen del sitio para asistentes de IA (convención llms.txt). Las guías,
// las comparativas y el blog salen de sus propias fuentes (_guides.ts y
// content/blog/*.md): publicar una página nueva la agrega aquí sin tocar nada.
export async function GET() {
  const posts = await getPublishedPosts();
  const link = (title: string, path: string, description: string, indent = "") => `${indent}- [${title}](${siteUrl(path)}): ${description}`;
  const guides = GUIDES.filter((g) => g.section !== "comparativas");
  const comparatives = GUIDES.filter((g) => g.section === "comparativas");
  const sections = [
    `# ${BRAND_NAME}\n\n${siteIntro()}`,
    `## Datos clave\n\n${keyFacts()}`,
    [
      "## Páginas",
      "",
      link("Inicio", "/", `qué hace ${BRAND_NAME}, cómo empezar y preguntas frecuentes.`),
      link("Planes y precios", "/precios", "licencias, cupos de contactos y créditos de IA."),
      link("Guías", "/guias", "todas las guías y comparativas."),
      `- [Contenido completo en un solo archivo](${siteUrl("/llms-full.txt")}): el texto de todas las páginas públicas en Markdown.`,
    ].join("\n"),
    ["## Guías", "", ...guides.map((g) => link(g.title, guidePath(g), g.description))].join("\n"),
    comparatives.length ? ["## Comparativas", "", ...comparatives.map((g) => link(g.title, guidePath(g), g.description))].join("\n") : "",
    posts.length
      ? ["## Blog", "", `Artículos sobre WhatsApp Business, ventas por chat y automatización (${siteUrl("/blog")}).`, "", ...posts.map((p) => link(p.title, `/blog/${p.slug}`, p.description))].join("\n")
      : "",
    [
      "## Para desarrolladores y legal",
      "",
      `- [API y webhooks](${appUrl("/docs/api")}): documentación para desarrolladores.`,
      `- [Contacto y soporte](${siteUrl("/contacto")})`,
      `- [Aviso de privacidad](${siteUrl("/privacidad")})`,
      `- [Términos y condiciones](${siteUrl("/terminos")})`,
    ].join("\n"),
  ].filter(Boolean);
  return new Response(sections.join("\n\n") + "\n", { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
