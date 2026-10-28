import { describe, expect, it } from "vitest";
import { getMessageBody, interactivePayloadOf, type WhatsAppMessageContent } from "@/lib/whatsapp/message-content";

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
