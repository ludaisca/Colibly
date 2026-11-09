import { BRAND_NAME } from "@/lib/brand";
import { siteUrl } from "@/lib/app-url";
import { BLOG_AUTHORS, BLOG_CATEGORIES, getPublishedPosts } from "@/lib/blog/posts";

export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const rfc822 = (iso: string) => new Date(`${iso}T12:00:00Z`).toUTCString();

// Feed RSS 2.0 con los 20 posts más recientes.
export async function GET() {
  const posts = (await getPublishedPosts()).slice(0, 20);
  const items = posts
    .map((p) => {
      const url = siteUrl(`/blog/${p.slug}`);
      return `<item><title>${esc(p.title)}</title><link>${url}</link><guid isPermaLink="true">${url}</guid><pubDate>${rfc822(p.date)}</pubDate><category>${esc(BLOG_CATEGORIES[p.category].label)}</category><author>${esc(BLOG_AUTHORS[p.author].name)}</author><description>${esc(p.description)}</description></item>`;
    })
    .join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>Blog de ${BRAND_NAME}</title><link>${siteUrl("/blog")}</link><atom:link href="${siteUrl("/blog/rss.xml")}" rel="self" type="application/rss+xml"/><description>WhatsApp Business, ventas por chat, atención al cliente y automatización con IA.</description><language>es-MX</language>${posts[0] ? `<lastBuildDate>${rfc822(posts[0].updated)}</lastBuildDate>` : ""}${items}</channel></rss>`;
  return new Response(xml, { headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": "public, max-age=1800" } });
}
