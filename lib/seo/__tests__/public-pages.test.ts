import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { GUIDES, guidePath } from "@/app/(marketing)/_guides";
import { getPublishedPosts } from "@/lib/blog/posts";
import { absolutizeLinks, getPublicPages, guideToMarkdown, pageHash } from "../public-pages";
import { SOCIAL_PROFILES, siteSchemaJson } from "../site-schema";

describe("absolutizeLinks", () => {
  it("vuelve absolutos los enlaces internos y respeta los externos y las anclas", () => {
    const out = absolutizeLinks("[a](/precios) [b](https://x.com/y) [c](#tema)");
    expect(out).toMatch(/\[a\]\(https?:\/\/[^)]+\/precios\)/);
    expect(out).toContain("[b](https://x.com/y)");
    expect(out).toContain("[c](#tema)");
  });
});

describe("guideToMarkdown", () => {
  it("incluye título, secciones, tablas y preguntas frecuentes", () => {
    for (const g of GUIDES) {
      const md = guideToMarkdown(g);
      expect(md.startsWith(`# ${g.h1}`)).toBe(true);
      for (const s of g.sections) expect(md).toContain(`## ${s.heading}`);
      for (const f of g.faq) expect(md).toContain(f.q);
    }
  });
});

describe("getPublicPages", () => {
  it("cubre inicio, precios, todas las guías y comparativas y todo el blog publicado, sin repetidos", async () => {
    const pages = await getPublicPages();
    const paths = pages.map((p) => p.path);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toContain("/");
    expect(paths).toContain("/precios");
    for (const g of GUIDES) expect(paths).toContain(guidePath(g));
    for (const p of await getPublishedPosts()) expect(paths).toContain(`/blog/${p.slug}`);
    expect(pages.filter((p) => p.kind === "comparativa").length).toBe(GUIDES.filter((g) => g.section === "comparativas").length);
  });
  it("no deja enlaces internos relativos en el Markdown de los posts", async () => {
    for (const page of (await getPublicPages()).filter((p) => p.kind === "blog")) expect(page.markdown).not.toMatch(/\]\(\/[^)]/);
  });
  it("el hash cambia solo cuando cambia el texto", () => {
    expect(pageHash("a")).toBe(pageHash("a"));
    expect(pageHash("a")).not.toBe(pageHash("b"));
  });
});

describe("JSON-LD de la organización", () => {
  it("lleva sameAs con los perfiles oficiales y un logo", () => {
    const org = JSON.parse(siteSchemaJson()).find((x: { "@type": string }) => x["@type"] === "Organization");
    expect(org.sameAs).toEqual(SOCIAL_PROFILES);
    expect(SOCIAL_PROFILES).toContain("https://www.instagram.com/colibly.crm");
    expect(SOCIAL_PROFILES).toContain("https://www.facebook.com/profile.php?id=61596385561338");
    expect(org.logo.url).toMatch(/\/logo-512\.png$/);
    expect(org.image).toBe(org.logo.url);
  });
  it("el logo es un PNG cuadrado de al menos 512x512 en public/", () => {
    const png = readFileSync(path.join(process.cwd(), "public", "logo-512.png"));
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    expect(width).toBe(height);
    expect(width).toBeGreaterThanOrEqual(512);
  });
});
