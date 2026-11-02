import { describe, expect, it } from "vitest";
import { getMediaInfo, getMessageBody, interactivePayloadOf, parseMessageEdit, type WhatsAppMessageContent } from "@/lib/whatsapp/message-content";

describe("getMessageBody", () => {
  it("la respuesta a un botón es el título que tocó el cliente", () => {
    const msg: WhatsAppMessageContent = {
      type: "interactive",
      interactive: { type: "button_reply", button_reply: { id: "si", title: "Sí, me interesa" } },
    };
    expect(getMessageBody(msg)).toBe("Sí, me interesa");
    expect(interactivePayloadOf(msg)).toBeNull();
  });

  it("un mensaje de lista enviado por el negocio conserva el texto y las filas", () => {
    const msg: WhatsAppMessageContent = {
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: "Elige un horario" },
        action: {
          button: "Ver horarios",
          sections: [{ rows: [{ id: "am", title: "Mañana" }, { id: "pm", title: "Tarde" }] }],
        },
      },
    };
    expect(getMessageBody(msg)).toBe("Elige un horario");
    expect(interactivePayloadOf(msg)).toEqual({
      buttons: [
        { id: "am", title: "Mañana" },
        { id: "pm", title: "Tarde" },
      ],
      style: "list",
      buttonLabel: "Ver horarios",
    });
  });
});

describe("sticker entrante", () => {
  it("guarda su media para poder descargarlo y mostrarlo", () => {
    const msg: WhatsAppMessageContent = { type: "sticker", sticker: { id: "st-1", mime_type: "image/webp", animated: false } };
    expect(getMediaInfo(msg)).toEqual({ mediaId: "st-1", mimeType: "image/webp", filename: null, caption: null });
  });
});

describe("parseMessageEdit", () => {
  it("una edición de texto trae el cuerpo nuevo y el id del original", () => {
    const msg: WhatsAppMessageContent = { type: "edit", edit: { original_message_id: "wamid.A", message: { text: { body: "La tiene sistemas" } } } };
    expect(parseMessageEdit(msg)).toEqual({ originalMessageId: "wamid.A", body: "La tiene sistemas", caption: null });
  });

  it("una edición de medio actualiza el pie", () => {
    const msg: WhatsAppMessageContent = {
      type: "edit",
      edit: { original_message_id: "wamid.B", message: { type: "image", image: { id: "m1", mime_type: "image/jpeg", caption: "Nuevo pie" } } },
    };
    expect(parseMessageEdit(msg)).toEqual({ originalMessageId: "wamid.B", body: "Nuevo pie", caption: "Nuevo pie" });
  });

  it("sin contenido legible no pisa el original con un marcador", () => {
    const msg: WhatsAppMessageContent = { type: "edit", edit: { original_message_id: "wamid.C", message: { type: "image", image: { id: "m1", mime_type: "image/jpeg" } } } };
    expect(parseMessageEdit(msg)).toEqual({ originalMessageId: "wamid.C", body: null, caption: null });
  });

  it("ignora lo que no es una edición o no trae original", () => {
    expect(parseMessageEdit({ type: "text", text: { body: "hola" } })).toBeNull();
    expect(parseMessageEdit({ type: "edit", edit: { message: { text: { body: "x" } } } })).toBeNull();
  });
});
