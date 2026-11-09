import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BRAND_NAME } from "@/lib/brand";
import { BLOG_CATEGORIES, getPublishedPosts, MIN_POSTS_TO_INDEX, type BlogCategory } from "@/lib/blog/posts";
import { breadcrumbJson } from "@/lib/seo/site-schema";
import { CategoryNav } from "../../_categories";
import { PostCard } from "../../_cards";

type Params = Promise<{ cat: string }>;

const isCategory = (c: string): c is BlogCategory => c in BLOG_CATEGORIES;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { cat } = await params;
  if (!isCategory(cat)) return {};
  const count = (await getPublishedPosts()).filter((p) => p.category === cat).length;
  const label = BLOG_CATEGORIES[cat].label;
  return {
    title: `${label}: artículos del blog`,
    description: BLOG_CATEGORIES[cat].description,
    alternates: { canonical: `/blog/categoria/${cat}` },
    robots: count < MIN_POSTS_TO_INDEX ? { index: false, follow: true } : undefined,
    openGraph: { type: "website", locale: "es_MX", siteName: BRAND_NAME, url: `/blog/categoria/${cat}`, title: `${label} · Blog de ${BRAND_NAME}`, description: BLOG_CATEGORIES[cat].description },
  };
}

export default async function BlogCategoryPage({ params }: { params: Params }) {
  const { cat } = await params;
  if (!isCategory(cat)) notFound();
  const posts = await getPublishedPosts();
  const inCategory = posts.filter((p) => p.category === cat);
  if (inCategory.length === 0) notFound();
  const { label, description } = BLOG_CATEGORIES[cat];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:py-12 md:px-6 md:py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: breadcrumbJson([{ name: "Blog", path: "/blog" }, { name: label, path: `/blog/categoria/${cat}` }]) }}
      />
      <header>
        <h1 className="text-balance font-display text-[2.75rem] font-bold leading-[0.98] tracking-[-0.015em] sm:text-6xl">{label}.</h1>
        <p className="mt-4 max-w-2xl text-pretty text-base leading-relaxed text-muted sm:text-lg">{description}</p>
      </header>
      <div className="mt-8"><CategoryNav posts={posts} active={cat} /></div>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {inCategory.map((p) => (
          <PostCard key={p.slug} post={p} />
        ))}
      </div>
    </div>
  );
}
