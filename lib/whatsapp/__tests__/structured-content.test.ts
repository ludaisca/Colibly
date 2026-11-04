import { describe, expect, it } from "vitest";
import { getMessageBody, structuredContentOf, type WhatsAppMessageContent } from "../message-content";

// Formas reales capturadas del webhook `messages` (2026-11-04), con datos
// personales cambiados. Ver docs/META_JSON_CUENTAS_WA_2026-11-04.md §7.
const location: WhatsAppMessageContent = { type: "location", location: { latitude: 19.4278565, longitude: -99.1628176 } };
const contacts: WhatsAppMessageContent = {
  type: "contacts",
  contacts: [{ name: { formatted_name: "Ana Pérez" }, phones: [{ phone: "+52 55 1111 2222", wa_id: "5215511112222", type: "Celular" }], vcard: "QkVHSU46VkNBUkQ=" }],
};
const sticker: WhatsAppMessageContent = { type: "sticker", sticker: { id: "1118", mime_type: "image/webp", sha256: "YSy4eTR1", animated: true } };
const image: WhatsAppMessageContent = { type: "image", image: { id: "1564", mime_type: "image/jpeg", caption: "Imagen a citar", sha256: "lltOcncp" } };
const reply: WhatsAppMessageContent = { type: "text", text: { body: "Hola esta es la cita" }, context: { id: "wamid.X", from: "5215511112222" } };

describe("structuredContentOf", () => {
  it("guarda las coordenadas de una ubicación (antes solo \"[location]\")", () => {
    expect(structuredContentOf(location)).toEqual({ location: { latitude: 19.4278565, longitude: -99.1628176, name: null, address: null, url: null } });
    expect(getMessageBody(location)).toBe("📍 Ubicación");
    expect(getMessageBody({ type: "location", location: { latitude: 1, longitude: 2, name: "Spa Aurora", address: "Roma Norte" } })).toBe("📍 Spa Aurora · Roma Norte");
  });

  it("guarda el contacto compartido sin la vCard", () => {
    expect(structuredContentOf(contacts)).toEqual({
      contacts: [{ name: "Ana Pérez", phones: [{ phone: "+52 55 1111 2222", waId: "5215511112222", type: "Celular" }], emails: [], company: null }],
    });
    expect(getMessageBody(contacts)).toBe("👤 Ana Pérez");
  });

  it("guarda sha256 y si el sticker es animado", () => {
    expect(structuredContentOf(sticker)).toEqual({ media: { sha256: "YSy4eTR1", animated: true } });
    expect(structuredContentOf(image)).toEqual({ media: { sha256: "lltOcncp" } });
  });

  it("guarda quién escribió el mensaje citado y las marcas de reenvío", () => {
    expect(structuredContentOf(reply)).toEqual({ replyToFrom: "5215511112222" });
    expect(structuredContentOf({ type: "text", text: { body: "x" }, context: { forwarded: true, frequently_forwarded: true } })).toEqual({ forwarded: true, frequentlyForwarded: true });
  });

  it("guarda pedidos con cantidades numéricas", () => {
    const order: WhatsAppMessageContent = { type: "order", order: { catalog_id: "cat1", product_items: [{ product_retailer_id: "facial", quantity: "2", item_price: 850, currency: "MXN" }] } };
    expect(structuredContentOf(order)).toEqual({ order: { catalogId: "cat1", text: null, items: [{ productId: "facial", quantity: 2, price: 850, currency: "MXN" }] } });
    expect(getMessageBody(order)).toBe("🛒 Pedido (1 producto)");
  });

  it("guarda los errores de un mensaje no soportado", () => {
    const unsupported: WhatsAppMessageContent = { type: "unsupported", errors: [{ code: 131051, title: "Message type unknown", error_data: { details: "Message type is currently not supported." } }] };
    expect(structuredContentOf(unsupported)).toEqual({ errors: [{ code: 131051, title: "Message type unknown", detail: "Message type is currently not supported." }] });
  });

  it("un texto simple no genera contenido", () => {
    expect(structuredContentOf({ type: "text", text: { body: "Hola" } })).toBeNull();
  });
});
