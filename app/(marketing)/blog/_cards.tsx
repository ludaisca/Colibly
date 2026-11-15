import { BLOG_CATEGORIES, type BlogPost } from "@/lib/blog/posts";
import { formatPostDate } from "@/lib/blog/format";

// Tarjeta de un post en el listado y en "Sigue leyendo".
export function PostCard({ post, featured = false }: { post: BlogPost; featured?: boolean }) {
  return (
    <article className={`flex min-w-0 flex-col rounded-xl border border-border bg-surface p-5 ${featured ? "sm:p-7 md:col-span-2" : ""}`}>
      <a href={`/blog/categoria/${post.category}`} className="text-xs font-semibold uppercase tracking-wide text-accent-ink hover:underline">
        {BLOG_CATEGORIES[post.category].label}
      </a>
      <h2 className={`mt-2 text-balance font-display font-bold leading-tight ${featured ? "text-3xl sm:text-4xl" : "text-2xl"}`}>
        <a href={`/blog/${post.slug}`} className="hover:underline hover:underline-offset-4">{post.title}</a>
      </h2>
      <p className="mt-2 text-pretty text-muted">{post.description}</p>
      <p className="mt-auto pt-4 text-sm text-muted-darker">
        <time dateTime={post.date}>{formatPostDate(post.date)}</time> · {post.readingMinutes} min de lectura
      </p>
    </article>
  );
}
