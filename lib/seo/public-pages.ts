import { createHash } from "crypto";
import { siteUrl } from "@/lib/app-url";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";
import { TRIAL_DAYS } from "@/lib/billing/plans";
import { META_FEES_NOTE, COEXISTENCE_PITCH } from "@/lib/billing/plan-features";
import { GUIDES, guidePath, type Guide } from "@/app/(marketing)/_guides";
import { FAQ } from "@/app/(marketing)/_landing-faq";
import { CHANNELS_PER_USER_LINE, LANDING_PLANS, OFFER_GROUPS, type OfferCell } from "@/app/(marketing)/_landing-offer-data";
import { NOTES } from "@/app/(marketing)/_pricing-notes";
import { getPublishedPosts, type BlogPost } from "@/lib/blog/posts";
import { keyFacts, siteIntro } from "./site-facts";

// Las páginas públicas de colibly.com como Markdown. Una sola fuente para
// /llms-full.txt (lo que leen los asistentes de IA) y para IndexNow (el hash
// del Markdown decide qué página cambió y hay que avisar a los buscadores).
// Salen de los mismos datos que renderizan las páginas: guías (_guides.ts),
// oferta (_landing-offer-data.ts), preguntas (_landing-faq.ts) y los .md del blog.

export type PublicPageKind = "inicio" | "precios" | "guia" | "comparativa" | "blog";

export interface PublicPage {
  /** Ruta canónica ("/", "/precios", "/crm-whatsapp", "/comparativas/…", "/blog/…"). */
  path: string;
  title: string;
  kind: PublicPageKind;
  markdown: string;
}

/** Enlaces internos relativos (`](/precios)`) → absolutos, para que se entiendan fuera del sitio. */
export function absolutizeLinks(markdown: string): string {
  return markdown.replace(/\]\((\/[^)\s]*)\)/g, (_m, p: string) => `](${siteUrl(p)})`);
}

const cell = (c: OfferCell): string => (c === true ? "Sí" : c === false ? "No" : c);

export function guideToMarkdown(g: Guide): string {
  const out: string[] = [`# ${g.h1}`, "", `> ${g.description}`, "", g.intro, ""];
  for (const s of g.sections) {
    out.push(`## ${s.heading}`, "");
    for (const p of s.paragraphs ?? []) out.push(p, "");
    if (s.bullets?.length) out.push(...s.bullets.map((b) => `- ${b}`), "");
    if (s.table) {
      out.push(`| ${s.table.headers.join(" | ")} |`, `| ${s.table.headers.map(() => "---").join(" | ")} |`);
      for (const row of s.table.rows) out.push(`| ${row.join(" | ")} |`);
      out.push("");
    }
  }
  if (g.faq.length) {
    out.push("## Preguntas frecuentes", "");
    for (const f of g.faq) out.push(`### ${f.q}`, "", f.a, "");
  }
  out.push(`Última revisión: ${g.updated}`);
  return out.join("\n");
}

export function postToMarkdown(p: BlogPost): string {
  return [`# ${p.title}`, "", `> ${p.description}`, "", `Publicado: ${p.date} · Actualizado: ${p.updated}`, "", absolutizeLinks(p.body.trim())].join("\n");
}

function homeMarkdown(): string {
  return [
    `# ${BRAND_NAME} — ${BRAND_TAGLINE}`,
    "",
    siteIntro(),
    "",
    "## Datos clave",
    "",
    keyFacts(),
    "",
    "## Canales y WhatsApp",
    "",
    `- ${CHANNELS_PER_USER_LINE}.`,
    `- ${COEXISTENCE_PITCH}`,
    `- ${META_FEES_NOTE}`,
    "",
    "## Preguntas frecuentes",
    "",
    ...FAQ.flatMap((f) => [`### ${f.q}`, "", f.a, ""]),
  ].join("\n");
}

function pricingMarkdown(): string {
  const out: string[] = [
    "# Planes y precios",
    "",
    `Cada persona del equipo paga una licencia al mes, en pesos mexicanos, y se pueden mezclar. Prueba de ${TRIAL_DAYS} días sin tarjeta.`,
    "",
  ];
  for (const p of LANDING_PLANS) {
    out.push(`## ${p.name}${p.priceMxn != null ? ` — $${p.priceMxn} MXN por usuario al mes` : " — a la medida"}`, "", p.tagline, "");
    out.push(`- ${p.leads}`, `- ${p.credits}`, `- ${p.channels}`, ...p.includes.map((i) => `- ${i}`), "");
  }
  out.push("## Lo que conviene saber", "", ...NOTES.map((n) => `- ${n}`), `- ${META_FEES_NOTE}`, "");
  out.push("## Comparación de licencias", "");
  for (const group of OFFER_GROUPS) {
    out.push(`### ${group.title}`, "", "| Función | Básico | Avanzado | Pro | Empresarial |", "| --- | --- | --- | --- | --- |");
    for (const item of group.items) if (item.kind === "row") out.push(`| ${item.label} | ${item.cells.map(cell).join(" | ")} |`);
    out.push("");
  }
  return out.join("\n");
}

/** Todas las páginas públicas indexables, en orden estable: inicio, precios, guías, comparativas, blog. */
export async function getPublicPages(): Promise<PublicPage[]> {
  const pages: PublicPage[] = [
    { path: "/", title: `${BRAND_NAME} — ${BRAND_TAGLINE}`, kind: "inicio", markdown: homeMarkdown() },
    { path: "/precios", title: "Planes y precios", kind: "precios", markdown: pricingMarkdown() },
  ];
  for (const g of GUIDES.filter((x) => x.section !== "comparativas")) pages.push({ path: guidePath(g), title: g.h1, kind: "guia", markdown: guideToMarkdown(g) });
  for (const g of GUIDES.filter((x) => x.section === "comparativas")) pages.push({ path: guidePath(g), title: g.h1, kind: "comparativa", markdown: guideToMarkdown(g) });
  for (const p of await getPublishedPosts()) pages.push({ path: `/blog/${p.slug}`, title: p.title, kind: "blog", markdown: postToMarkdown(p) });
  return pages;
}

export function pageHash(markdown: string): string {
  return createHash("sha256").update(markdown).digest("hex").slice(0, 32);
}
