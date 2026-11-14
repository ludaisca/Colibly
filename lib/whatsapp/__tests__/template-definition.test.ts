import { describe, it, expect } from "vitest";
import { buildTemplateDefinitionPayload, templateDefinitionError, type TemplateDefinition } from "@/lib/whatsapp/template-definition";

const def = (components: TemplateDefinition["components"], category: TemplateDefinition["category"] = "MARKETING"): TemplateDefinition => ({ name: "t", language: "es", category, components });

describe("templateDefinitionError", () => {
  it("acepta variables por posición o con nombre, no mezcladas", () => {
    expect(templateDefinitionError(def({ body: "Hola {{1}}", bodyExamples: ["Ana"] }))).toBeNull();
    expect(templateDefinitionError(def({ body: "Hola {{nombre}}", bodyExamples: { nombre: "Ana" } }))).toBeNull();
    expect(templateDefinitionError(def({ body: "Hola {{nombre}} {{1}}", bodyExamples: ["a"] }))).toMatch(/no mezcles/);
    expect(templateDefinitionError(def({ body: "Hola {{nombre}}", bodyExamples: ["Ana"] }))).toMatch(/como objeto/);
    expect(templateDefinitionError(def({ body: "Hola {{Nombre}}" }))).toMatch(/minúsculas/);
    expect(templateDefinitionError(def({ body: "Hola {{2}}", bodyExamples: ["a"] }))).toMatch(/seguidas/);
  });

  it("valida botones: respuestas rápidas juntas, teléfono, copiar código y Flow", () => {
    expect(templateDefinitionError(def({ body: "x", buttons: [{ type: "QUICK_REPLY", text: "a" }, { type: "URL", text: "b", url: "https://a.mx" }, { type: "QUICK_REPLY", text: "c" }] }))).toMatch(/juntas/);
    expect(templateDefinitionError(def({ body: "x", buttons: [{ type: "PHONE_NUMBER", text: "Llamar" }] }))).toMatch(/phoneNumber/);
    expect(templateDefinitionError(def({ body: "x", buttons: [{ type: "COPY_CODE" }] }))).toMatch(/example/);
    expect(templateDefinitionError(def({ body: "x", buttons: [{ type: "FLOW", text: "Abrir", flowId: "123456" }] }))).toMatch(/navigateScreen/);
    expect(templateDefinitionError(def({ body: "x", buttons: [{ type: "FLOW", text: "Abrir", flowId: "123456", navigateScreen: "INICIO" }, { type: "PHONE_NUMBER", text: "Llamar", phoneNumber: "+52 55 1234 5678" }] }))).toBeNull();
  });

  it("autenticación: solo el bloque authentication; ONE_TAP pide la app", () => {
    expect(templateDefinitionError(def({ authentication: { otpType: "COPY_CODE" } }, "AUTHENTICATION"))).toBeNull();
    expect(templateDefinitionError(def({ body: "x", authentication: { otpType: "COPY_CODE" } }, "AUTHENTICATION"))).toMatch(/fija el texto/);
    expect(templateDefinitionError(def({ authentication: { otpType: "ONE_TAP" } }, "AUTHENTICATION"))).toMatch(/packageName/);
    expect(templateDefinitionError(def({ body: "x", authentication: { otpType: "COPY_CODE" } }))).toMatch(/solo va con/);
  });

  it("oferta y carrusel solo en MARKETING y con sus reglas", () => {
    const lto = { body: "x", limitedTimeOffer: { text: "Hoy", hasExpiration: true }, buttons: [{ type: "URL" as const, text: "Ir", url: "https://a.mx" }] };
    expect(templateDefinitionError(def(lto))).toMatch(/COPY_CODE/);
    expect(templateDefinitionError(def({ ...lto, buttons: [{ type: "COPY_CODE", example: "A" }, ...lto.buttons] }))).toBeNull();
    expect(templateDefinitionError(def(lto, "UTILITY"))).toMatch(/MARKETING/);
    const card = { header: { format: "IMAGE" as const, exampleHandle: "h" }, body: "Modelo", buttons: [{ type: "QUICK_REPLY" as const, text: "Quiero" }] };
    expect(templateDefinitionError(def({ body: "Mira", carousel: [card, card] }))).toBeNull();
    expect(templateDefinitionError(def({ body: "Mira", carousel: [card] }))).toMatch(/2 a 10/);
    expect(templateDefinitionError(def({ body: "Mira", carousel: [card, { ...card, buttons: [{ type: "URL", text: "Ver", url: "https://a.mx" }] }] }))).toMatch(/mismos botones/);
  });

  it("cabecera de ubicación sin ejemplo; multimedia lo exige", () => {
    expect(templateDefinitionError(def({ header: { format: "LOCATION" }, body: "x" }, "UTILITY"))).toBeNull();
    expect(templateDefinitionError(def({ header: { format: "IMAGE" }, body: "x" }))).toMatch(/ejemplo/);
  });
});

describe("buildTemplateDefinitionPayload", () => {
  it("variables con nombre: parameter_format NAMED y ejemplos con param_name", () => {
    const p = buildTemplateDefinitionPayload(def({ header: { format: "TEXT", text: "Hola {{nombre}}", exampleText: "Ana" }, body: "Tu cita es el {{fecha}}", bodyExamples: { fecha: "lunes" } }, "UTILITY"));
    expect(p.parameter_format).toBe("NAMED");
    expect(p.components).toEqual([
      { type: "HEADER", format: "TEXT", text: "Hola {{nombre}}", example: { header_text_named_params: [{ param_name: "nombre", example: "Ana" }] } },
      { type: "BODY", text: "Tu cita es el {{fecha}}", example: { body_text_named_params: [{ param_name: "fecha", example: "lunes" }] } },
    ]);
  });

  it("autenticación con un toque", () => {
    const p = buildTemplateDefinitionPayload(def({ authentication: { otpType: "ONE_TAP", codeExpirationMinutes: 10, packageName: "mx.app", signatureHash: "K8a/AINcGX7", addSecurityRecommendation: true } }, "AUTHENTICATION"));
    expect(p.parameter_format).toBeUndefined();
    expect(p.components).toEqual([
      { type: "BODY", add_security_recommendation: true },
      { type: "FOOTER", code_expiration_minutes: 10 },
      { type: "BUTTONS", buttons: [{ type: "OTP", otp_type: "ONE_TAP", supported_apps: [{ package_name: "mx.app", signature_hash: "K8a/AINcGX7" }] }] },
    ]);
  });

  it("botones, oferta y carrusel con la forma de Meta", () => {
    const p = buildTemplateDefinitionPayload(def({
      body: "x",
      limitedTimeOffer: { text: "Hoy", hasExpiration: true },
      buttons: [{ type: "COPY_CODE", example: "NOV" }, { type: "URL", text: "Ir", url: "https://a.mx/{{1}}", urlExample: "https://a.mx/1" }],
    }));
    expect(p.components.slice(1)).toEqual([
      { type: "LIMITED_TIME_OFFER", limited_time_offer: { text: "Hoy", has_expiration: true } },
      { type: "BUTTONS", buttons: [{ type: "COPY_CODE", example: "NOV" }, { type: "URL", text: "Ir", url: "https://a.mx/{{1}}", example: ["https://a.mx/1"] }] },
    ]);
    const card = { header: { format: "VIDEO" as const, exampleHandle: "h1" }, buttons: [{ type: "PHONE_NUMBER" as const, text: "Llamar", phoneNumber: "+52 55 1234-5678" }] };
    const c = buildTemplateDefinitionPayload(def({ body: "Mira", carousel: [card, card] }));
    expect(c.components[1]).toEqual({
      type: "CAROUSEL",
      cards: [0, 1].map(() => ({ components: [{ type: "HEADER", format: "VIDEO", example: { header_handle: ["h1"] } }, { type: "BUTTONS", buttons: [{ type: "PHONE_NUMBER", text: "Llamar", phone_number: "+525512345678" }] }] })),
    });
  });
});
