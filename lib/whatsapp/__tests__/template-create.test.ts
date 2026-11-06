import { describe, it, expect } from "vitest";
import { templateCreateSchema } from "@/lib/validations";
import { buildPayload, templateInputError } from "@/lib/whatsapp/templates";

function input(components: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return templateCreateSchema.parse({ waAccountId: "acc", name: "pedido_listo", language: "es_MX", components, ...extra });
}

describe("templateInputError", () => {
  it("acepta una plantilla simple", () => {
    expect(templateInputError(input({ body: "Hola, tu cita es mañana." }))).toBeNull();
  });

  it("exige un ejemplo por variable del cuerpo y variables seguidas", () => {
    expect(templateInputError(input({ body: "Hola {{1}} y {{2}}", bodyExamples: ["Ana"] }))).toMatch(/ejemplo para cada variable/);
    expect(templateInputError(input({ body: "Hola {{2}}", bodyExamples: ["Ana"] }))).toMatch(/seguidas/);
    expect(templateInputError(input({ body: "Hola {{1}}", bodyExamples: [" "] }))).toMatch(/valor de ejemplo/);
    expect(templateInputError(input({ body: "Hola {{1}} {{1}}", bodyExamples: ["Ana"] }))).toBeNull();
  });

  it("la cabecera de texto con variable pide ejemplo y admite solo {{1}}", () => {
    expect(templateInputError(input({ body: "Hola", header: { format: "TEXT", text: "Pedido {{1}}" } }))).toMatch(/ejemplo para la variable/);
    expect(templateInputError(input({ body: "Hola", header: { format: "TEXT", text: "Pedido {{1}}", exampleText: "A-1" } }))).toBeNull();
    expect(templateInputError(input({ body: "Hola", header: { format: "TEXT", text: "{{1}} y {{2}}", exampleText: "A" } }))).toMatch(/una sola variable/);
    expect(templateInputError(input({ body: "Hola", header: { format: "TEXT", text: "" } }))).toMatch(/texto de la cabecera/);
  });

  it("la cabecera con medio pide el archivo de ejemplo", () => {
    expect(templateInputError(input({ body: "Hola", header: { format: "IMAGE" } }))).toMatch(/archivo de ejemplo/);
    expect(templateInputError(input({ body: "Hola", header: { format: "IMAGE", exampleHandle: "4::abc" } }))).toBeNull();
  });

  it("botón URL: estática, dinámica con ejemplo y los errores comunes", () => {
    const btn = (url: string, urlExample?: string) => input({ body: "Hola", buttons: [{ type: "URL", text: "Ver", url, urlExample }] });
    expect(templateInputError(btn("https://colibly.com/pedidos"))).toBeNull();
    expect(templateInputError(btn("https://colibly.com/p/{{1}}"))).toMatch(/URL de ejemplo/);
    expect(templateInputError(btn("https://colibly.com/p/{{1}}", "https://colibly.com/p/A-1"))).toBeNull();
    expect(templateInputError(btn("https://colibly.com/p/{{1}}", "https://otro.com/p/A-1"))).toMatch(/mismo dominio/);
    expect(templateInputError(btn("https://colibly.com/{{1}}/x", "https://colibly.com/a/x"))).toMatch(/al final/);
    expect(templateInputError(btn("no es url"))).toMatch(/no es válida/);
    expect(templateInputError(btn("javascript:alert(1)"))).toMatch(/no es válida/);
  });
});

describe("buildPayload", () => {
  it("manda header_text y el ejemplo del botón URL solo cuando hay variable", () => {
    const p = buildPayload(
      input(
        {
          header: { format: "TEXT", text: "Pedido {{1}}", exampleText: "A-1043" },
          body: "Hola {{1}}",
          bodyExamples: ["Ana"],
          footer: "Colibly",
          buttons: [
            { type: "URL", text: "Rastrear", url: "https://colibly.com/p/{{1}}", urlExample: "https://colibly.com/p/A-1043" },
            { type: "URL", text: "Sitio", url: "https://colibly.com" },
            { type: "QUICK_REPLY", text: "Gracias" },
          ],
        },
        { category: "UTILITY" }
      )
    );
    expect(p.category).toBe("UTILITY");
    expect(p.components[0]).toEqual({ type: "HEADER", format: "TEXT", text: "Pedido {{1}}", example: { header_text: ["A-1043"] } });
    expect(p.components[1]).toEqual({ type: "BODY", text: "Hola {{1}}", example: { body_text: [["Ana"]] } });
    const buttons = p.components.find((c) => c.type === "BUTTONS")!.buttons!;
    expect(buttons[0]).toEqual({ type: "URL", text: "Rastrear", url: "https://colibly.com/p/{{1}}", example: ["https://colibly.com/p/A-1043"] });
    expect(buttons[1]).toEqual({ type: "URL", text: "Sitio", url: "https://colibly.com" });
    expect(buttons[2]).toEqual({ type: "QUICK_REPLY", text: "Gracias" });
  });

  it("la categoría por defecto es MARKETING y una cabecera de texto sin variable no lleva ejemplo", () => {
    const p = buildPayload(input({ header: { format: "TEXT", text: "Hola" }, body: "Cuerpo" }));
    expect(p.category).toBe("MARKETING");
    expect(p.components[0]).toEqual({ type: "HEADER", format: "TEXT", text: "Hola" });
  });

  it("rechaza categorías que no se crean desde aquí", () => {
    expect(() => input({ body: "x" }, { category: "AUTHENTICATION" })).toThrow();
  });
});
