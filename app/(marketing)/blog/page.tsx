import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BRAND_NAME } from "@/lib/brand";
import { getPublishedPosts, POSTS_PER_PAGE } from "@/lib/blog/posts";
import { breadcrumbJson } from "@/lib/seo/site-schema";
import { CategoryNav } from "./_categories";
import { PostCard } from "./_cards";

const DESCRIPTION = `Artículos de ${BRAND_NAME} sobre WhatsApp Business, ventas por chat, atención al cliente y automatización con IA para negocios de México.`;

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ pagina?: string }> }): Promise<Metadata> {
  const page = Math.max(1, Number((await searchParams).pagina) || 1);
  const path = page > 1 ? `/blog?pagina=${page}` : "/blog";
  return {
    title: page > 1 ? `Blog · página ${page}` : "Blog de WhatsApp y ventas por chat",
    description: DESCRIPTION,
    alternates: { canonical: path, types: { "application/rss+xml": "/blog/rss.xml" } },
    openGraph: { type: "website", locale: "es_MX", siteName: BRAND_NAME, url: path, title: `Blog · ${BRAND_NAME}`, description: DESCRIPTION },
  };
}

export default async function BlogIndexPage({ searchParams }: { searchParams: Promise<{ pagina?: string }> }) {
  const posts = await getPublishedPosts();
  const totalPages = Math.max(1, Math.ceil(posts.length / POSTS_PER_PAGE));
  const page = Math.max(1, Number((await searchParams).pagina) || 1);
  if (page > totalPages) notFound();
  const slice = posts.slice((page - 1) * POSTS_PER_PAGE, page * POSTS_PER_PAGE);
  const link = "inline-flex min-h-11 items-center rounded-lg border border-border bg-surface px-4 font-medium hover:bg-background";

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:py-12 md:px-6 md:py-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: breadcrumbJson([{ name: "Blog", path: "/blog" }]) }} />
      <header>
        <h1 className="text-balance font-display text-[2.75rem] font-bold leading-[0.98] tracking-[-0.015em] sm:text-6xl">Blog.</h1>
        <p className="mt-4 max-w-2xl text-pretty text-base leading-relaxed text-muted sm:text-lg">
          Cómo atender, vender y automatizar por WhatsApp y otros canales, sin rodeos.
        </p>
      </header>
      <div className="mt-8"><CategoryNav posts={posts} /></div>
      {slice.length === 0 ? (
        <p className="mt-10 text-muted">Pronto publicaremos los primeros artículos.</p>
      ) : (
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {slice.map((p, i) => (
            <PostCard key={p.slug} post={p} featured={page === 1 && i === 0} />
          ))}
        </div>
      )}
      {totalPages > 1 && (
        <nav aria-label="Páginas del blog" className="mt-10 flex items-center justify-between gap-3">
          {page > 1 ? <a href={page === 2 ? "/blog" : `/blog?pagina=${page - 1}`} rel="prev" className={link}>Anterior</a> : <span />}
          <span className="text-sm text-muted">Página {page} de {totalPages}</span>
          {page < totalPages ? <a href={`/blog?pagina=${page + 1}`} rel="next" className={link}>Siguiente</a> : <span />}
        </nav>
      )}
    </div>
  );
}
