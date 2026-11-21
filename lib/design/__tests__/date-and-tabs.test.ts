import { describe, expect, it } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { DateRangePicker } from "@/app/components/ui/date-picker";
import { Tabs } from "@/app/components/ui/tabs";
import { InternationalizationProvider } from "@astryxdesign/core/i18n";
import { ASTRYX_LOCALE, ASTRYX_MESSAGES } from "@/lib/astryx/i18n";

// Como en la app (app/providers.tsx): Astryx en es-MX.
const render = (element: ReactElement) =>
  // eslint-disable-next-line react/no-children-prop -- createElement tipa `children` como prop obligatoria.
  renderToString(createElement(InternationalizationProvider, { locale: ASTRYX_LOCALE, messages: ASTRYX_MESSAGES, children: element }));

describe("Fechas y pestañas (Astryx)", () => {
  it("el rango de fechas muestra el periodo en español de México", () => {
    const html = render(createElement(DateRangePicker, { value: { start: "2026-09-01", end: "2026-09-29" }, onChange: () => {} }));
    expect(html).toMatch(/1 sept? 2026/);
    expect(html).toMatch(/29 sept? 2026/);
  });

  it("mantiene una pestaña seleccionada y su panel asociado", () => {
    // createElement tipa `children` como prop obligatoria en componentes genéricos.
    // eslint-disable-next-line react/no-children-prop
    const html = render(createElement(Tabs, { items: [{ id: "a", label: "Primera" }, { id: "b", label: "Segunda" }], value: "b", onChange: () => {}, label: "Secciones", children: createElement("p", null, "Contenido activo") }));
    expect(html).toContain("Segunda");
    expect(html).toContain("Contenido activo");
  });
});
