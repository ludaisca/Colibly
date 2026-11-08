import { describe, expect, it } from "vitest";
import { templateCategoryLabel, templateLanguageLabel } from "../template-labels";

describe("template labels", () => {
  it("categoría", () => {
    expect(templateCategoryLabel("UTILITY")).toBe("Utilidad");
    expect(templateCategoryLabel("OTRA")).toBe("OTRA");
  });
  it("idioma", () => {
    expect(templateLanguageLabel("es")).toBe("Español");
    expect(templateLanguageLabel("en_US")).toMatch(/^Inglés/);
    expect(templateLanguageLabel("")).toBe("");
  });
});
