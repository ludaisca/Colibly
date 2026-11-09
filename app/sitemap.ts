import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/app-url";
import { GUIDES, guidePath } from "@/app/(marketing)/_guides";
import { BLOG_CATEGORIES, getPublishedPosts, MIN_POSTS_TO_INDEX, type BlogCategory } from "@/lib/blog/posts";

// Solo el sitio público; el panel requiere sesión. Dinámico por SITE_URL.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await getPublishedPosts();
  const categories = (Object.keys(BLOG_CATEGORIES) as BlogCategory[]).filter((c) => posts.filter((p) => p.category === c).length >= MIN_POSTS_TO_INDEX);
  return [
    { url: siteUrl("/"), changeFrequency: "weekly", priority: 1 },
    { url: siteUrl("/precios"), changeFrequency: "monthly", priority: 0.8 },
    { url: siteUrl("/guias"), changeFrequency: "weekly", priority: 0.7 },
    ...GUIDES.map((g) => ({ url: siteUrl(guidePath(g)), lastModified: g.updated, changeFrequency: "monthly" as const, priority: 0.7 })),
    ...(posts.length
      ? [
          { url: siteUrl("/blog"), lastModified: posts[0].updated, changeFrequency: "weekly" as const, priority: 0.8 },
          ...posts.map((p) => ({ url: siteUrl(`/blog/${p.slug}`), lastModified: p.updated, changeFrequency: "monthly" as const, priority: 0.6 })),
          ...categories.map((c) => ({ url: siteUrl(`/blog/categoria/${c}`), changeFrequency: "weekly" as const, priority: 0.4 })),
        ]
      : []),
    { url: siteUrl("/contacto"), changeFrequency: "yearly", priority: 0.5 },
    { url: siteUrl("/eliminar-datos"), changeFrequency: "yearly", priority: 0.3 },
    { url: siteUrl("/terminos"), changeFrequency: "yearly", priority: 0.3 },
    { url: siteUrl("/privacidad"), changeFrequency: "yearly", priority: 0.3 },
  ];
}
