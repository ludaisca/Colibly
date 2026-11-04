import { describe, expect, it } from "vitest";
import { publicText, serializeMessage, type SerializableMessage } from "../serialize";

const base: SerializableMessage = {
  id: "cmmsg_1",
  direction: "INBOUND",
  messageType: "text",
  body: "Hola",
  caption: null,
  mimeType: null,
  filename: null,
  status: null,
  senderId: null,
  timestamp: new Date("2026-11-04T18:50:09.000Z"),
};

describe("publicText", () => {
  it("quita los marcadores [tipo] que guardaba el ingest", () => {
    expect(publicText("[location]", "location")).toBeNull();
    expect(publicText("[sticker]", "sticker")).toBeNull();
    expect(publicText("", "text")).toBeNull();
    expect(publicText("Hola [sticker] mañana", "text")).toBe("Hola [sticker] mañana");
    expect(publicText("📍 Spa Aurora", "location")).toBe("📍 Spa Aurora");
  });
});

describe("serializeMessage", () => {
  it("conserva los campos de la v1 y añade los nuevos en null para un texto", () => {
    const out = serializeMessage({ ...base, wamid: "wamid.A" }, "cmchat_1");
    expect(out).toMatchObject({ id: "cmmsg_1", conversationId: "cmchat_1", type: "text", text: "Hola", interactive: null, externalId: "wamid.A" });
    expect(out).toMatchObject({ content: null, media: null, replyTo: null, reaction: null, transcript: null, error: null, pricing: null });
  });

  it("expone el medio con la URL de Colibly, nunca la de Meta", () => {
    const out = serializeMessage(
      { ...base, messageType: "image", body: "Imagen a citar", caption: "Imagen a citar", mimeType: "image/jpeg", mediaUrl: "acc/2026/x.jpg", bytesSize: 1234, content: { media: { sha256: "lltO" } } },
      "cmchat_1"
    );
    expect(out.media).toEqual({ url: expect.stringMatching(/\/api\/v1\/messages\/cmmsg_1\/media$/), ready: true, mimeType: "image/jpeg", filename: null, size: 1234, sha256: "lltO" });
  });

  it("un medio que aún se descarga sale con ready=false", () => {
    const out = serializeMessage({ ...base, messageType: "audio", body: "[audio]", mimeType: "audio/ogg" }, "cmchat_1");
    expect(out.text).toBeNull();
    expect(out.media?.ready).toBe(false);
  });

  it("resuelve la cita, la reacción, el error y el pricing", () => {
    const out = serializeMessage(
      {
        ...base,
        direction: "OUTBOUND",
        replyToWamid: "wamid.IMG",
        content: { replyToFrom: "5215511112222" },
        reactionEmoji: "😂",
        errorCode: 131047,
        errorMessage: "Fuera de la ventana de 24 h",
        pricing: { billable: false, pricing_model: "PMP", category: "service", type: "free_customer_service" },
      },
      "cmchat_1",
      { replyToMessageId: "cmmsg_img" }
    );
    expect(out.replyTo).toEqual({ externalId: "wamid.IMG", messageId: "cmmsg_img", from: "5215511112222" });
    expect(out.reaction).toEqual({ contact: "😂", agent: null });
    expect(out.error).toEqual({ code: 131047, message: "Fuera de la ventana de 24 h", title: null, details: null, href: null });
    expect(out.pricing).toEqual({ billable: false, model: "PMP", category: "service", type: "free_customer_service" });
  });

  it("entrega el error de Meta sin traducir junto al texto en español", () => {
    const out = serializeMessage(
      {
        ...base,
        direction: "OUTBOUND",
        errorCode: 131026,
        errorMessage: "El número no puede recibir mensajes",
        errorDetail: { code: 131026, title: "Message undeliverable", message: "Message undeliverable", details: "Unable to deliver", href: "https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes/" },
      },
      "cmchat_1"
    );
    expect(out.error).toEqual({
      code: 131026,
      message: "El número no puede recibir mensajes",
      title: "Message undeliverable",
      details: "Unable to deliver",
      href: "https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes/",
    });
  });

  it("dice quién mandó el mensaje", () => {
    expect(serializeMessage(base, "c")).toMatchObject({ origin: "contact", sentBy: "contact", senderName: null });
    expect(serializeMessage({ ...base, direction: "OUTBOUND", sentVia: "agent", senderId: "u1", sender: { name: "Carla" } }, "c")).toMatchObject({ origin: "agent", sentBy: "user", senderName: "Carla" });
    expect(serializeMessage({ ...base, direction: "OUTBOUND", origin: "BUSINESS_APP_ECHO" }, "c")).toMatchObject({ origin: "business_app", sentBy: "business_app" });
    expect(serializeMessage({ ...base, direction: "OUTBOUND", sentVia: "bot" }, "c")).toMatchObject({ origin: "bot", sentBy: "bot" });
  });

  it("los canales genéricos usan externalMessageId y replyToExternalId", () => {
    const out = serializeMessage({ ...base, externalMessageId: "42", replyToExternalId: "41" }, "cmconv_1");
    expect(out.externalId).toBe("42");
    expect(out.replyTo).toEqual({ externalId: "41", messageId: null, from: null });
  });
});
