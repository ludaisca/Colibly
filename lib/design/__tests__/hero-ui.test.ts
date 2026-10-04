import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { HeroDateRange } from "@/app/components/ui/hero-date-range";
import { HeroTabs } from "@/app/components/ui/hero-tabs";

describe("HeroUI con estilos Colibly", () => {
  it("renderiza el rango controlado sin el tema global de HeroUI", () => {
    const html = renderToString(createElement(HeroDateRange, { value: { start: "2026-09-01", end: "2026-09-29" }, onChange: () => {} }));
    expect(html).toContain("colibly-hero-range");
    expect(html).toContain("2026");
  });

  it("mantiene una pestaña seleccionada y su panel asociado", () => {
    // createElement tipa `children` como prop obligatoria en componentes genéricos.
    // eslint-disable-next-line react/no-children-prop
    const html = renderToString(createElement(HeroTabs, { items: [{ id: "a", label: "Primera" }, { id: "b", label: "Segunda" }], value: "b", onChange: () => {}, label: "Secciones", children: createElement("p", null, "Contenido activo") }));
    expect(html).toContain("Segunda");
    expect(html).toContain("Contenido activo");
  });
});
