import { existsSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { GUIDES, guidePath } from "@/app/(marketing)/_guides";
import { buildPost, extractHeadings, getAllPostsUnfiltered, parseFrontmatter, readingMinutes, slugifyHeading } from "../posts";

const FRONT = `---
title: "Título de prueba"
description: Una descripción
date: 2026-11-12
category: producto
related: [crm-whatsapp, otro-post]
draft: true
---
**Respuesta corta:** algo.

## Primer tema
texto
`;

describe("frontmatter", () => {
  it("lee cadenas, listas y booleanos", () => {
    const { data, body } = parseFrontmatter(FRONT);
    expect(data.title).toBe("Título de prueba");
    expect(data.related).toEqual(["crm-whatsapp", "otro-post"]);
    expect(data.draft).toBe(true);
    expect(body.startsWith("**Respuesta corta:**")).toBe(true);
  });

  it("buildPost rechaza datos faltantes o categorías desconocidas", () => {
    expect(() => buildPost("x", "---\ntitle: A\n---\ncuerpo")).toThrow(/falta description/);
    expect(() => buildPost("x", FRONT.replace("producto", "inventada"))).toThrow(/category desconocida/);
  });

  it("buildPost arma el post con ids de encabezados y tiempo de lectura", () => {
    const post = buildPost("x", FRONT);
    expect(post.updated).toBe("2026-11-12");
    expect(post.author).toBe("equipo-colibly");
    expect(post.headings).toEqual([{ id: "primer-tema", text: "Primer tema" }]);
    expect(post.readingMinutes).toBe(1);
  });

  it("los encabezados dentro de un bloque de código no cuentan", () => {
    expect(extractHeadings("```\n## no\n```\n## sí")).toEqual([{ id: "si", text: "sí" }]);
    expect(slugifyHeading("¿Qué es la ventana de 24 horas?")).toBe("que-es-la-ventana-de-24-horas");
    expect(readingMinutes("palabra ".repeat(600))).toBe(3);
  });
});

// Guardas de cada post real (content/blog): un error aquí es una página rota o
// un dato mal puesto en producción.
const RESERVED = ["precios", "contacto", "terminos", "privacidad", "eliminar-datos", "docs", "guias", "producto", "blog", "categoria", "og"];

describe("posts de content/blog", async () => {
  const posts = await getAllPostsUnfiltered();
  const guideSlugs = GUIDES.map((g) => g.slug);
  const postSlugs = posts.map((p) => p.slug);
  const knownPaths = new Set<string>([
    "/", "/precios", "/contacto", "/guias", "/blog", "/privacidad", "/terminos",
    ...GUIDES.map((g) => guidePath(g)),
    ...postSlugs.map((s) => `/blog/${s}`),
  ]);

  it("slugs únicos, con formato válido y sin chocar con otras rutas", () => {
    expect(new Set(postSlugs).size).toBe(postSlugs.length);
    for (const s of postSlugs) {
      expect(s, s).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(RESERVED).not.toContain(s);
    }
  });

  for (const p of posts) {
    describe(p.slug, () => {
      it("título y descripción caben en los resultados", () => {
        expect(p.title.length).toBeLessThanOrEqual(60);
        expect(p.description.length).toBeLessThanOrEqual(160);
      });

      it("abre con la respuesta corta", () => {
        expect(p.body.trimStart().startsWith("**Respuesta corta:**")).toBe(true);
      });

      it("tiene cuerpo suficiente y encabezados", () => {
        if (p.draft) return;
        expect(p.body.split(/\s+/).length).toBeGreaterThanOrEqual(450);
        expect(p.headings.length).toBeGreaterThanOrEqual(2);
      });

      it("enlaza a una guía y a precios o a la prueba", () => {
        if (p.draft) return;
        const links = [...p.body.matchAll(/\]\((\/[^)\s#]*)/g)].map((m) => m[1]);
        expect(links.some((l) => GUIDES.some((g) => guidePath(g) === l)), "sin enlace a una guía").toBe(true);
        expect(links.includes("/precios"), "sin enlace a /precios").toBe(true);
      });

      it("los enlaces internos existen", () => {
        for (const m of p.body.matchAll(/\]\((\/[^)\s#]*)/g)) {
          expect(knownPaths.has(m[1].replace(/\/$/, "") || "/"), `${p.slug} → ${m[1]}`).toBe(true);
        }
      });

      it("los relacionados existen, las fechas son coherentes y la imagen está", () => {
        for (const r of p.related) expect([...guideSlugs, ...postSlugs], `${p.slug} → ${r}`).toContain(r);
        expect(p.updated >= p.date).toBe(true);
        if (p.image) {
          expect(existsSync(path.join(process.cwd(), "public", p.image)), p.image).toBe(true);
          expect(p.imageAlt, "la imagen necesita imageAlt").toBeTruthy();
        }
      });
    });
  }
});
