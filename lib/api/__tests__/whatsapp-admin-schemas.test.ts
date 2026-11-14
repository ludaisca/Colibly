import { describe, it, expect } from "vitest";
import { apiSendMessageSchema, apiBlockUsersSchema, apiBusinessProfileSchema, apiConversationalAutomationSchema, apiQrCreateSchema, apiTemplateCreateSchema } from "@/lib/api/schemas";

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

  it("10 dígitos sin código de país se toman como México", () => {
    expect(apiBlockUsersSchema.parse({ phones: ["5568623317"] })).toEqual({ phones: ["525568623317"] });
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

  it("rechaza nombres que Meta no acepta y acepta la definición completa", () => {
    expect(apiTemplateCreateSchema.safeParse({ ...base, name: "Promo Nov" }).success).toBe(false);
    expect(apiTemplateCreateSchema.safeParse({ ...base, category: "AUTHENTICATION", components: { authentication: { otpType: "COPY_CODE" } } }).success).toBe(true);
    expect(apiTemplateCreateSchema.safeParse({ ...base, components: { body: "Hola {{nombre}}", bodyExamples: { nombre: "Ana" }, buttons: [{ type: "COPY_CODE", example: "NOV" }] } }).success).toBe(true);
    expect(apiTemplateCreateSchema.safeParse({ ...base, components: { ...base.components, carousel: [{ header: { format: "IMAGE", exampleUrl: "https://a.mx/1.jpg" }, buttons: [{ type: "QUICK_REPLY", text: "Sí" }] }] } }).success).toBe(false);
  });
});

describe("apiConversationalAutomationSchema", () => {
  it("quita la / del comando y acepta [] para borrar", () => {
    expect(apiConversationalAutomationSchema.parse({ commands: [{ name: "/horarios", description: "Horario" }], prompts: [] }))
      .toEqual({ commands: [{ name: "horarios", description: "Horario" }], prompts: [] });
  });

  it("aplica los topes de Meta", () => {
    expect(apiConversationalAutomationSchema.safeParse({}).success).toBe(false);
    expect(apiConversationalAutomationSchema.safeParse({ prompts: ["a", "b", "c", "d", "e"] }).success).toBe(false);
    expect(apiConversationalAutomationSchema.safeParse({ prompts: ["x".repeat(81)] }).success).toBe(false);
    expect(apiConversationalAutomationSchema.safeParse({ commands: [{ name: "dos palabras", description: "x" }] }).success).toBe(false);
  });
});

describe("apiQrCreateSchema", () => {
  it("pide el mensaje prellenado de hasta 140 caracteres", () => {
    expect(apiQrCreateSchema.safeParse({ prefilledMessage: "Hola" }).success).toBe(true);
    expect(apiQrCreateSchema.safeParse({ prefilledMessage: "" }).success).toBe(false);
    expect(apiQrCreateSchema.safeParse({ prefilledMessage: "x".repeat(141) }).success).toBe(false);
    expect(apiQrCreateSchema.safeParse({ prefilledMessage: "Hola", format: "JPG" }).success).toBe(false);
  });
});

describe("POST /messages con catálogo", () => {
  const to = { conversationId: "c1" };
  it("acepta producto, lista y catálogo con sus campos", () => {
    expect(apiSendMessageSchema.safeParse({ ...to, type: "product", product: { id: "SKU-1" } }).success).toBe(true);
    expect(apiSendMessageSchema.safeParse({ ...to, type: "product_list", text: "Hola", productList: { header: "Ofertas", sections: [{ title: "A", productIds: ["1"] }] } }).success).toBe(true);
    expect(apiSendMessageSchema.safeParse({ ...to, type: "catalog", text: "Mira", footer: "Pie" }).success).toBe(true);
  });

  it("rechaza lo que Meta no acepta", () => {
    expect(apiSendMessageSchema.safeParse({ ...to, type: "product" }).success).toBe(false);
    expect(apiSendMessageSchema.safeParse({ ...to, type: "product_list", productList: { header: "x", sections: [{ title: "A", productIds: ["1"] }] } }).success).toBe(false);
    const many = Array.from({ length: 31 }, (_, i) => String(i));
    expect(apiSendMessageSchema.safeParse({ ...to, type: "product_list", text: "x", productList: { header: "x", sections: [{ title: "A", productIds: many }] } }).success).toBe(false);
    expect(apiSendMessageSchema.safeParse({ ...to, type: "text", text: "x", footer: "pie" }).success).toBe(false);
    expect(apiSendMessageSchema.safeParse({ ...to, type: "product", product: { id: "A", catalogId: "abc" } }).success).toBe(false);
  });
});
