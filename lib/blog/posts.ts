import { promises as fs } from "fs";
import path from "path";

// Blog de colibly.com/blog (docs/PLAN_BLOG_2026-11-09.md). Los posts son
// archivos Markdown en content/blog/<slug>.md con frontmatter; se publican con
// el deploy (el Dockerfile copia content/). Sin base de datos ni panel.

export const BLOG_DIR = path.join(process.cwd(), "content", "blog");

/** Categorías cerradas: no se crean al vuelo para no dispersar el SEO. */
export const BLOG_CATEGORIES = {
  "whatsapp-business": { label: "WhatsApp Business", description: "La API de WhatsApp, la Coexistencia, las plantillas y las políticas de Meta, explicadas para negocios." },
  "ventas-por-chat": { label: "Ventas por chat", description: "Cómo dar seguimiento, ordenar el embudo y cerrar ventas desde las conversaciones." },
  "atencion-al-cliente": { label: "Atención al cliente", description: "Tiempos de respuesta, equipos y hábitos para atender mejor por chat." },
  "automatizacion-e-ia": { label: "Automatización e IA", description: "Bots, automatizaciones y respuestas con IA que ayudan sin sustituir a tu equipo." },
  "casos-y-sectores": { label: "Casos y sectores", description: "Cómo usar el chat de ventas y atención en clínicas, spas, tiendas y otros negocios." },
  producto: { label: "Producto", description: "Novedades y mejoras de Colibly." },
} as const;

export type BlogCategory = keyof typeof BLOG_CATEGORIES;

export const BLOG_AUTHORS = {
  "equipo-colibly": { name: "Equipo Colibly" },
} as const;

export type BlogAuthor = keyof typeof BLOG_AUTHORS;

export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  /** Publicación, AAAA-MM-DD. */
  date: string;
  /** Última revisión real, AAAA-MM-DD. */
  updated: string;
  category: BlogCategory;
  author: BlogAuthor;
  /** Ruta bajo /public (opcional). Sin ella se genera la imagen OG. */
  image: string | null;
  imageAlt: string | null;
  /** Slugs de guías o de otros posts. */
  related: string[];
  draft: boolean;
  body: string;
  readingMinutes: number;
  /** Encabezados de nivel 2 (índice de contenido). */
  headings: { id: string; text: string }[];
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function unquote(v: string): string {
  const t = v.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1);
  return t;
}

/** Frontmatter mínimo: `clave: valor`, listas `[a, b]` y booleanos. */
export function parseFrontmatter(raw: string): { data: Record<string, string | string[] | boolean>; body: string } {
  const text = raw.replace(/\r\n/g, "\n");
  if (!text.startsWith("---\n")) return { data: {}, body: text };
  const end = text.indexOf("\n---", 4);
  if (end === -1) return { data: {}, body: text };
  const data: Record<string, string | string[] | boolean> = {};
  for (const line of text.slice(4, end).split("\n")) {
    const m = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (!m) continue;
    // Un comentario `# …` al final solo cuenta fuera de comillas.
    const value = m[2].replace(/\s+#[^"']*$/, "").trim();
    if (value.startsWith("[") && value.endsWith("]")) {
      data[m[1]] = value.slice(1, -1).split(",").map(unquote).filter(Boolean);
    } else if (value === "true" || value === "false") {
      data[m[1]] = value === "true";
    } else {
      data[m[1]] = unquote(value);
    }
  }
  return { data, body: text.slice(end + 4).replace(/^\n+/, "") };
}

export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function extractHeadings(body: string): { id: string; text: string }[] {
  const out: { id: string; text: string }[] = [];
  let inFence = false;
  for (const line of body.split("\n")) {
    if (line.trim().startsWith("```")) inFence = !inFence;
    if (inFence) continue;
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (m) out.push({ id: slugifyHeading(m[1]), text: m[1].replace(/[*_`]/g, "") });
  }
  return out;
}

export function readingMinutes(body: string): number {
  const words = body.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Construye un post desde el texto del archivo. Lanza con un mensaje claro si algo falta. */
export function buildPost(slug: string, raw: string): BlogPost {
  const { data, body } = parseFrontmatter(raw);
  const problems: string[] = [];
  const title = str(data.title);
  const description = str(data.description);
  const date = str(data.date);
  const updated = str(data.updated) || date;
  const category = str(data.category) as BlogCategory;
  const author = (str(data.author) || "equipo-colibly") as BlogAuthor;
  if (!title) problems.push("falta title");
  if (!description) problems.push("falta description");
  if (!DATE.test(date)) problems.push("date inválida (AAAA-MM-DD)");
  if (!DATE.test(updated)) problems.push("updated inválida (AAAA-MM-DD)");
  if (!(category in BLOG_CATEGORIES)) problems.push(`category desconocida: ${category || "(vacía)"}`);
  if (!(author in BLOG_AUTHORS)) problems.push(`author desconocido: ${author}`);
  if (problems.length) throw new Error(`Post ${slug}: ${problems.join("; ")}`);
  const image = str(data.image) || null;
  return {
    slug,
    title,
    description,
    date,
    updated,
    category,
    author,
    image,
    imageAlt: str(data.imageAlt) || null,
    related: Array.isArray(data.related) ? data.related : [],
    draft: data.draft === true,
    body,
    readingMinutes: readingMinutes(body),
    headings: extractHeadings(body),
  };
}

async function readAll(): Promise<BlogPost[]> {
  let files: string[] = [];
  try {
    files = (await fs.readdir(BLOG_DIR)).filter((f) => f.endsWith(".md"));
  } catch {
    return [];
  }
  const posts = await Promise.all(files.map(async (f) => buildPost(f.replace(/\.md$/, ""), await fs.readFile(path.join(BLOG_DIR, f), "utf8"))));
  return posts;
}

/** Todos los archivos, borradores y fechas futuras incluidos (para el test de validación). */
export async function getAllPostsUnfiltered(): Promise<BlogPost[]> {
  return readAll();
}

const today = () => new Date().toISOString().slice(0, 10);

/** Publicados: sin borradores y sin fecha futura (así se programa un post). Más nuevos primero. */
export async function getPublishedPosts(): Promise<BlogPost[]> {
  const now = today();
  return (await readAll())
    .filter((p) => !p.draft && p.date <= now)
    .sort((a, b) => (a.date === b.date ? a.slug.localeCompare(b.slug) : a.date < b.date ? 1 : -1));
}

export async function getPost(slug: string): Promise<BlogPost | null> {
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  return (await getPublishedPosts()).find((p) => p.slug === slug) ?? null;
}

export const POSTS_PER_PAGE = 12;

/** Con menos posts una categoría es una página delgada: se publica pero no se indexa ni entra al sitemap. */
export const MIN_POSTS_TO_INDEX = 3;
