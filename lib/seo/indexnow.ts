import { siteUrl } from "@/lib/app-url";
import { getRedisClient } from "@/lib/redis";
import { getPublishedPosts } from "@/lib/blog/posts";
import { GUIDES, guidePath } from "@/app/(marketing)/_guides";
import { getPublicPages, pageHash } from "./public-pages";
import { changedUrls, chunk, INDEXNOW_BATCH, INDEXNOW_ENDPOINT, indexNowPayload, shouldSubmit } from "./indexnow-rules";

// Avisa a IndexNow de las páginas públicas nuevas o editadas. El contenido
// llega con el deploy (guías en código, posts en content/blog) y los posts
// programados "aparecen" al llegar su fecha, así que no hay un momento de
// "publicar" que enganchar: se compara el hash del Markdown de cada página con
// el último avisado (Redis) al arrancar la app y una vez al día. Lo que no
// cambió no se vuelve a enviar.

const HASHES_KEY = "indexnow:hashes";

/** URL absoluta → hash de su contenido, de todo lo indexable. */
async function currentHashes(): Promise<Record<string, string>> {
  const hashes: Record<string, string> = {};
  for (const page of await getPublicPages()) hashes[siteUrl(page.path)] = pageHash(page.markdown);
  // Los índices no tienen texto propio: su hash es la lista de lo que enlazan.
  const posts = await getPublishedPosts();
  hashes[siteUrl("/blog")] = pageHash(posts.map((p) => `${p.slug}:${p.updated}`).join("|"));
  // /comparativas ya entra arriba por getPublicPages() (hash de su Markdown, que
  // lleva las tablas y la lista de comparativas).
  hashes[siteUrl("/guias")] = pageHash(GUIDES.map((g) => `${guidePath(g)}:${g.updated}`).join("|"));
  return hashes;
}

export interface IndexNowResult {
  status: "skipped" | "unchanged" | "submitted" | "failed";
  submitted: number;
  detail?: string;
}

export async function submitChangedPages(): Promise<IndexNowResult> {
  const target = shouldSubmit({ nodeEnv: process.env.NODE_ENV, siteUrl: process.env.SITE_URL });
  if (!target) return { status: "skipped", submitted: 0, detail: "Solo se envía desde producción con un dominio público" };

  const redis = getRedisClient();
  const current = await currentHashes();
  const stored = await redis.hgetall(HASHES_KEY);
  const urls = changedUrls(current, stored);
  if (urls.length === 0) return { status: "unchanged", submitted: 0 };

  for (const batch of chunk(urls, INDEXNOW_BATCH)) {
    const res = await fetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(indexNowPayload(target.host, batch)),
      signal: AbortSignal.timeout(20_000),
    });
    // 200 y 202 = aceptado (202: la clave aún se está validando). Cualquier otro
    // estado deja los hashes sin tocar: el siguiente tick lo reintenta.
    if (res.status !== 200 && res.status !== 202) {
      const detail = `IndexNow respondió ${res.status}`;
      console.warn(`[indexnow] ${detail}`);
      return { status: "failed", submitted: 0, detail };
    }
    await redis.hset(HASHES_KEY, Object.fromEntries(batch.map((url) => [url, current[url]])));
  }
  // Páginas que ya no existen: se olvidan (no se avisa de borrados).
  const gone = Object.keys(stored).filter((url) => !(url in current));
  if (gone.length) await redis.hdel(HASHES_KEY, ...gone);
  console.log(`[indexnow] ${urls.length} URL(s) enviadas`);
  return { status: "submitted", submitted: urls.length };
}
