import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BRAND_NAME } from "@/lib/brand";
import { appUrl, siteUrl } from "@/lib/app-url";
import { TRIAL_DAYS } from "@/lib/billing/plans";
import { Button } from "@/app/components/ui/button";
import { BLOG_AUTHORS, BLOG_CATEGORIES, getPost, getPublishedPosts, type BlogPost } from "@/lib/blog/posts";
import { formatPostDate } from "@/lib/blog/format";
import { breadcrumbJson } from "@/lib/seo/site-schema";
import { GUIDES } from "../../_guides";
import { PostCard } from "../_cards";
import { PostBody } from "../_markdown";

type Params = Promise<{ slug: string }>;

function imageUrl(post: BlogPost): string {
  return post.image ? siteUrl(post.image) : siteUrl(`/blog/og/${post.slug}`);
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const post = await getPost((await params).slug);
  if (!post) return {};
  const path = `/blog/${post.slug}`;
  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: path },
    authors: [{ name: BLOG_AUTHORS[post.author].name }],
    openGraph: {
      type: "article",
      locale: "es_MX",
      siteName: BRAND_NAME,
      url: path,
      title: `${post.title} · ${BRAND_NAME}`,
      description: post.description,
      publishedTime: post.date,
      modifiedTime: post.updated,
      section: BLOG_CATEGORIES[post.category].label,
      images: [{ url: imageUrl(post), width: 1200, height: 630, alt: post.imageAlt ?? post.title }],
    },
    twitter: { card: "summary_large_image", title: post.title, description: post.description, images: [imageUrl(post)] },
  };
}

function postJson(post: BlogPost): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    inLanguage: "es-MX",
    mainEntityOfPage: siteUrl(`/blog/${post.slug}`),
    datePublished: post.date,
    dateModified: post.updated,
    image: imageUrl(post),
    articleSection: BLOG_CATEGORIES[post.category].label,
    author: { "@id": siteUrl("/#organization") },
    publisher: { "@id": siteUrl("/#organization") },
  }).replace(/</g, "\\u003c");
}

export default async function BlogPostPage({ params }: { params: Params }) {
  const post = await getPost((await params).slug);
  if (!post) notFound();
  const all = await getPublishedPosts();

  const relatedGuides = post.related.map((s) => GUIDES.find((g) => g.slug === s)).filter((g) => !!g);
  const relatedPosts = [
    ...post.related.map((s) => all.find((p) => p.slug === s)).filter((p): p is BlogPost => !!p),
    ...all.filter((p) => p.slug !== post.slug && p.category === post.category && !post.related.includes(p.slug)),
  ].slice(0, 3);

  return (
    <article className="mx-auto max-w-6xl px-4 py-10 sm:py-12 md:px-6 md:py-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: postJson(post) }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: breadcrumbJson([{ name: "Blog", path: "/blog" }, { name: post.title, path: `/blog/${post.slug}` }]) }}
      />
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_16rem] lg:gap-14">
        <div className="mx-auto min-w-0 max-w-[44rem] lg:mx-0">
          <nav aria-label="Ruta" className="text-sm text-muted-strong">
            <Link href="/blog" className="hover:underline">Blog</Link>
            <span aria-hidden> / </span>
            <a href={`/blog/categoria/${post.category}`} className="hover:underline">{BLOG_CATEGORIES[post.category].label}</a>
          </nav>
          <h1 className="mt-4 text-balance font-display text-[2.5rem] font-bold leading-[1] tracking-[-0.015em] sm:text-5xl">{post.title}</h1>
          <p className="mt-4 text-pretty text-lg leading-relaxed text-muted-strong">{post.description}</p>
          <p className="mt-5 text-sm text-muted-darker">
            {BLOG_AUTHORS[post.author].name} · <time dateTime={post.date}>{formatPostDate(post.date)}</time>
            {post.updated !== post.date && (
              <>
                {" "}· Actualizado el <time dateTime={post.updated}>{formatPostDate(post.updated)}</time>
              </>
            )}{" "}
            · {post.readingMinutes} min de lectura
          </p>

          <PostBody markdown={post.body} />

          <div className="mt-12 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-5">
            <p className="min-w-0 flex-1 text-pretty font-medium">Prueba {BRAND_NAME} {TRIAL_DAYS} días, sin tarjeta.</p>
            <Button href={appUrl("/register")} data-track="blog-cta">Crear mi cuenta</Button>
          </div>

          {relatedGuides.length > 0 && (
            <section className="mt-10">
              <h2 className="font-display text-2xl font-bold">Guías relacionadas</h2>
              <ul className="mt-3 list-disc space-y-1.5 pl-6">
                {relatedGuides.map((g) => (
                  <li key={g.slug}>
                    <a href={`/${g.slug}`} className="font-medium text-accent-ink underline underline-offset-2">{g.title}</a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {post.headings.length >= 3 && (
          <aside className="hidden lg:block">
            <nav aria-label="Contenido del artículo" className="sticky top-24 text-sm">
              <p className="font-semibold text-foreground">En este artículo</p>
              <ul className="mt-3 space-y-2 border-l border-border pl-4">
                {post.headings.map((h) => (
                  <li key={h.id}>
                    <a href={`#${h.id}`} className="text-pretty text-muted-strong hover:text-foreground hover:underline">{h.text}</a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>
        )}
      </div>

      {relatedPosts.length > 0 && (
        <section className="mt-14 border-t border-border pt-10">
          <h2 className="font-display text-3xl font-bold">Sigue leyendo</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {relatedPosts.map((p) => (
              <PostCard key={p.slug} post={p} />
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
