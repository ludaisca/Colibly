import Link from "next/link";
import { BLOG_CATEGORIES, type BlogCategory, type BlogPost } from "@/lib/blog/posts";

// Navegación por categoría (solo las que ya tienen posts).
export function CategoryNav({ posts, active }: { posts: BlogPost[]; active?: BlogCategory }) {
  const used = (Object.keys(BLOG_CATEGORIES) as BlogCategory[]).filter((c) => posts.some((p) => p.category === c));
  const chip = (on: boolean) =>
    `inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium md:min-h-9 ${on ? "border-foreground bg-foreground text-background" : "border-border bg-surface hover:bg-background"}`;
  return (
    <nav aria-label="Categorías del blog" className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 md:mx-0 md:flex-wrap md:px-0">
      <Link href="/blog" className={chip(!active)} aria-current={!active ? "page" : undefined}>Todos</Link>
      {used.map((c) => (
        <a key={c} href={`/blog/categoria/${c}`} className={`${chip(active === c)} shrink-0`} aria-current={active === c ? "page" : undefined}>
          {BLOG_CATEGORIES[c].label}
        </a>
      ))}
    </nav>
  );
}
