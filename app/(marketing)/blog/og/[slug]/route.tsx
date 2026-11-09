import { BLOG_CATEGORIES, getPost } from "@/lib/blog/posts";
import { renderPostShareImage } from "../../../_share-image";

// Imagen para compartir un post (1200×630). Ruta propia, no el archivo
// opengraph-image, para conocer su URL exacta y ponerla también en el JSON-LD.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const post = await getPost((await params).slug);
  if (!post) return new Response("No encontrado", { status: 404 });
  const res = await renderPostShareImage(post.title, BLOG_CATEGORIES[post.category].label);
  res.headers.set("cache-control", "public, max-age=86400, stale-while-revalidate=604800");
  return res;
}
