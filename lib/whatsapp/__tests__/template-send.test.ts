import { describe, it, expect } from "vitest";
import { buildTemplateSend, describeTemplateSend, TemplateParamsError } from "@/lib/whatsapp/template-send";

const positional = [
  { type: "HEADER", format: "TEXT", text: "Pedido {{1}}" },
  { type: "BODY", text: "Hola {{1}}, tu pedido {{2}} está listo" },
  { type: "BUTTONS", buttons: [{ type: "URL", text: "Ver", url: "https://a.mx/p/{{1}}" }, { type: "QUICK_REPLY", text: "Gracias" }, { type: "PHONE_NUMBER", text: "Llamar" }] },
];

describe("buildTemplateSend", () => {
  it("por posición, con el atajo buttonParam y payload en la respuesta rápida", () => {
    const r = buildTemplateSend(positional, "UTILITY", { bodyParams: ["Ana", "A-1"], headerParam: "A-1", buttonParam: "A-1", buttons: [{ index: 1, payload: "gracias_a1" }] });
    expect(r.components).toEqual([
      { type: "header", parameters: [{ type: "text", text: "A-1" }] },
      { type: "body", parameters: [{ type: "text", text: "Ana" }, { type: "text", text: "A-1" }] },
      { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "A-1" }] },
      { type: "button", sub_type: "quick_reply", index: "1", parameters: [{ type: "payload", payload: "gracias_a1" }] },
    ]);
    expect(r.text).toBe("Pedido A-1\n\nHola Ana, tu pedido A-1 está listo");
  });

  it("con nombre: manda parameter_name y exige cada variable", () => {
    const named = [{ type: "BODY", text: "Hola {{nombre}}, tu cita es el {{fecha}}" }];
    const r = buildTemplateSend(named, "UTILITY", { bodyParams: { nombre: "Ana", fecha: "lunes" } });
    expect(r.components[0]).toEqual({ type: "body", parameters: [{ type: "text", parameter_name: "nombre", text: "Ana" }, { type: "text", parameter_name: "fecha", text: "lunes" }] });
    expect(r.text).toBe("Hola Ana, tu cita es el lunes");
    expect(() => buildTemplateSend(named, "UTILITY", { bodyParams: { nombre: "Ana" } })).toThrow(/fecha/);
    expect(() => buildTemplateSend(named, "UTILITY", { bodyParams: ["Ana", "lunes"] })).toThrow(TemplateParamsError);
  });

  it("faltan parámetros, botón inexistente o campo equivocado", () => {
    expect(() => buildTemplateSend(positional, "UTILITY", { bodyParams: ["Ana"], headerParam: "x", buttonParam: "x" })).toThrow(/2 parámetro/);
    expect(() => buildTemplateSend(positional, "UTILITY", { bodyParams: ["Ana", "B"], headerParam: "x" })).toThrow(/urlParam/);
    expect(() => buildTemplateSend(positional, "UTILITY", { bodyParams: ["Ana", "B"], headerParam: "x", buttonParam: "x", buttons: [{ index: 7, payload: "a" }] })).toThrow(/índice 7/);
    expect(() => buildTemplateSend(positional, "UTILITY", { bodyParams: ["Ana", "B"], headerParam: "x", buttonParam: "x", buttons: [{ index: 2, payload: "a" }] })).toThrow(/no lleva payload/);
  });

  it("cabecera de archivo (URL o media id) y de ubicación", () => {
    expect(buildTemplateSend([{ type: "HEADER", format: "IMAGE" }, { type: "BODY", text: "Hola" }], "MARKETING", { headerParam: "123456" }).components[0])
      .toEqual({ type: "header", parameters: [{ type: "image", image: { id: "123456" } }] });
    const loc = buildTemplateSend([{ type: "HEADER", format: "LOCATION" }, { type: "BODY", text: "Aquí" }], "UTILITY", { headerLocation: { latitude: 19.4, longitude: -99.1, name: "Sucursal" } });
    expect(loc.components[0]).toEqual({ type: "header", parameters: [{ type: "location", location: { latitude: 19.4, longitude: -99.1, name: "Sucursal" } }] });
    expect(() => buildTemplateSend([{ type: "HEADER", format: "LOCATION" }, { type: "BODY", text: "x" }], "UTILITY", {})).toThrow(/headerLocation/);
  });

  it("autenticación: el código va en el cuerpo y en el botón OTP", () => {
    const auth = [{ type: "BODY", text: "*{{1}}* es tu código." }, { type: "BUTTONS", buttons: [{ type: "OTP", otp_type: "COPY_CODE", text: "Copiar" }] }];
    expect(buildTemplateSend(auth, "AUTHENTICATION", { code: "482913" }).components).toEqual([
      { type: "body", parameters: [{ type: "text", text: "482913" }] },
      { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "482913" }] },
    ]);
    expect(() => buildTemplateSend(auth, "AUTHENTICATION", {})).toThrow(/code/);
  });

  it("oferta por tiempo limitado con copiar código", () => {
    const lto = [
      { type: "BODY", text: "Oferta" },
      { type: "LIMITED_TIME_OFFER", limited_time_offer: { text: "Hoy", has_expiration: true } },
      { type: "BUTTONS", buttons: [{ type: "COPY_CODE", example: "X" }, { type: "URL", text: "Ir", url: "https://a.mx" }] },
    ];
    const at = new Date(Date.now() + 3_600_000).toISOString();
    const r = buildTemplateSend(lto, "MARKETING", { offerExpiresAt: at, buttons: [{ index: 0, couponCode: "NOV25" }] });
    expect(r.components).toEqual([
      { type: "limited_time_offer", parameters: [{ type: "limited_time_offer", limited_time_offer: { expiration_time_ms: new Date(at).getTime() } }] },
      { type: "button", sub_type: "copy_code", index: "0", parameters: [{ type: "coupon_code", coupon_code: "NOV25" }] },
    ]);
    expect(() => buildTemplateSend(lto, "MARKETING", { buttons: [{ index: 0, couponCode: "A" }] })).toThrow(/offerExpiresAt/);
    expect(() => buildTemplateSend(lto, "MARKETING", { offerExpiresAt: "2020-01-01T00:00:00Z", buttons: [{ index: 0, couponCode: "A" }] })).toThrow(/ya pasó/);
  });

  it("carrusel: una entrada por tarjeta con su archivo, cuerpo y botones", () => {
    const card = { components: [{ type: "HEADER", format: "IMAGE" }, { type: "BODY", text: "Modelo {{1}}" }, { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Quiero" }] }] };
    const carousel = [{ type: "BODY", text: "Mira esto" }, { type: "CAROUSEL", cards: [card, card] }];
    const r = buildTemplateSend(carousel, "MARKETING", {
      cards: [
        { headerParam: "https://a.mx/1.jpg", bodyParams: ["A"], buttons: [{ index: 0, payload: "a" }] },
        { headerParam: "https://a.mx/2.jpg", bodyParams: ["B"] },
      ],
    });
    expect(r.components).toEqual([
      {
        type: "carousel",
        cards: [
          { card_index: 0, components: [{ type: "header", parameters: [{ type: "image", image: { link: "https://a.mx/1.jpg" } }] }, { type: "body", parameters: [{ type: "text", text: "A" }] }, { type: "button", sub_type: "quick_reply", index: "0", parameters: [{ type: "payload", payload: "a" }] }] },
          { card_index: 1, components: [{ type: "header", parameters: [{ type: "image", image: { link: "https://a.mx/2.jpg" } }] }, { type: "body", parameters: [{ type: "text", text: "B" }] }] },
        ],
      },
    ]);
    expect(() => buildTemplateSend(carousel, "MARKETING", { cards: [{ headerParam: "1", bodyParams: ["A"] }] })).toThrow(/2 tarjetas/);
  });
});

describe("describeTemplateSend", () => {
  it("dice qué pide cada parte", () => {
    expect(describeTemplateSend(positional, "UTILITY")).toEqual({
      parameterFormat: "POSITIONAL",
      bodyParams: 2,
      header: { format: "TEXT", required: true },
      buttons: [
        { index: 0, type: "URL", text: "Ver", param: "urlParam", required: true },
        { index: 1, type: "QUICK_REPLY", text: "Gracias", param: "payload", required: false },
        { index: 2, type: "PHONE_NUMBER", text: "Llamar", param: null, required: false },
      ],
      requiresCode: false,
      offer: null,
      carouselCards: null,
    });
    expect(describeTemplateSend([{ type: "BODY", text: "Hola {{nombre}}" }], "MARKETING")).toMatchObject({ parameterFormat: "NAMED", bodyParams: ["nombre"] });
  });
});
