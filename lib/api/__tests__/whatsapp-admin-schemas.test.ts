import { describe, it, expect } from "vitest";
import { apiBlockUsersSchema, apiBusinessProfileSchema, apiTemplateCreateSchema } from "@/lib/api/schemas";

describe("apiBusinessProfileSchema", () => {
  it("acepta un cambio parcial y \"\" para borrar", () => {
    expect(apiBusinessProfileSchema.parse({ email: "", websites: ["https://a.mx"] })).toEqual({ email: "", websites: ["https://a.mx"] });
  });

  it("rechaza un cuerpo vacío, campos desconocidos y los topes de Meta", () => {
    expect(apiBusinessProfileSchema.safeParse({}).success).toBe(false);
    expect(apiBusinessProfileSchema.safeParse({ nombre: "x" }).success).toBe(false);
    expect(apiBusinessProfileSchema.safeParse({ about: "" }).success).toBe(false);
    expect(apiBusinessProfileSchema.safeParse({ about: "a".repeat(140) }).success).toBe(false);
    expect(apiBusinessProfileSchema.safeParse({ websites: ["https://a.mx", "https://b.mx", "https://c.mx"] }).success).toBe(false);
    expect(apiBusinessProfileSchema.safeParse({ vertical: "retail" }).success).toBe(false);
    expect(apiBusinessProfileSchema.safeParse({ profilePictureUrl: "http://a.mx/f.jpg" }).success).toBe(false);
  });
});

describe("apiBlockUsersSchema", () => {
  it("limpia los teléfonos a dígitos", () => {
    expect(apiBlockUsersSchema.parse({ phones: ["+52 1 55 1234 5678"] })).toEqual({ phones: ["5215512345678"] });
  });

  it("pide entre 1 y 100 teléfonos válidos", () => {
    expect(apiBlockUsersSchema.safeParse({ phones: [] }).success).toBe(false);
    expect(apiBlockUsersSchema.safeParse({ phones: ["123"] }).success).toBe(false);
    expect(apiBlockUsersSchema.safeParse({ phones: Array(101).fill("5215512345678") }).success).toBe(false);
  });
});

describe("apiTemplateCreateSchema", () => {
  const base = { accountId: "acc1", name: "promo_noviembre", components: { body: "Hola {{1}}", bodyExamples: ["Ana"] } };

  it("aplica los mismos valores por defecto que el formulario", () => {
    expect(apiTemplateCreateSchema.parse(base)).toMatchObject({ language: "es", category: "MARKETING" });
  });

  it("la cabecera multimedia lleva exampleUrl https, no el handle interno", () => {
    expect(apiTemplateCreateSchema.safeParse({ ...base, components: { ...base.components, header: { format: "IMAGE", exampleUrl: "https://a.mx/p.jpg" } } }).success).toBe(true);
    expect(apiTemplateCreateSchema.safeParse({ ...base, components: { ...base.components, header: { format: "IMAGE", exampleHandle: "4::abc" } } }).success).toBe(false);
    expect(apiTemplateCreateSchema.safeParse({ ...base, components: { ...base.components, header: { format: "IMAGE", exampleUrl: "http://a.mx/p.jpg" } } }).success).toBe(false);
  });

  it("rechaza nombres que Meta no acepta y la categoría AUTHENTICATION", () => {
    expect(apiTemplateCreateSchema.safeParse({ ...base, name: "Promo Nov" }).success).toBe(false);
    expect(apiTemplateCreateSchema.safeParse({ ...base, category: "AUTHENTICATION" }).success).toBe(false);
  });
});
