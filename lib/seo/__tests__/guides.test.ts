import { existsSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { GUIDES } from "@/app/(marketing)/_guides";

// Guardas de las guías de búsqueda (SEO/GEO): una guía sin su page.tsx sería
// una URL en el sitemap que da 404, y una descripción muy larga se corta en
// los resultados.

const slugs = GUIDES.map((g) => g.slug);

describe("guías de búsqueda", () => {
  it("cada guía tiene su ruta (page.tsx)", () => {
    for (const slug of slugs) {
      expect(existsSync(path.join(process.cwd(), "app/(marketing)", slug, "page.tsx")), slug).toBe(true);
    }
  });

  it("los slugs son únicos y no chocan con rutas del sitio", () => {
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const reserved of ["precios", "contacto", "terminos", "privacidad", "eliminar-datos", "docs", "guias", "producto"]) {
      expect(slugs).not.toContain(reserved);
    }
  });

  it("los relacionados existen y la fecha de revisión es válida", () => {
    for (const g of GUIDES) {
      for (const r of g.related) expect(slugs, `${g.slug} → ${r}`).toContain(r);
      expect(g.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(g.faq.length, g.slug).toBeGreaterThan(0);
    }
  });

  it("title y description caben en los resultados de búsqueda", () => {
    for (const g of GUIDES) {
      expect(g.title.length, `${g.slug} title`).toBeLessThanOrEqual(60);
      expect(g.description.length, `${g.slug} description`).toBeLessThanOrEqual(175);
    }
  });
});
