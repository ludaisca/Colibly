import { describe, expect, it } from "vitest";
import { messagePreview } from "@/app/components/whatsapp/chat-shared";

describe("messagePreview", () => {
  it("cita un documento con su nombre, no [document]", () => {
    expect(messagePreview({ messageType: "document", body: null, filename: "ConstanciaNoDeudor.pdf" })).toBe("ConstanciaNoDeudor.pdf");
    expect(messagePreview({ messageType: "document", body: "[document]", filename: "Billing.pdf" })).toBe("Billing.pdf");
  });

  it("cae a una etiqueta legible si el medio no tiene texto ni nombre", () => {
    expect(messagePreview({ messageType: "image", body: null })).toBe("Imagen");
    expect(messagePreview({ messageType: "video", body: "[video]" })).toBe("Video");
    expect(messagePreview({ messageType: "audio", body: null })).toBe("Audio");
    expect(messagePreview({ messageType: "sticker", body: null })).toBe("Sticker");
    expect(messagePreview({ messageType: "document", body: null })).toBe("Documento");
  });

  it("prefiere el caption o el texto real", () => {
    expect(messagePreview({ messageType: "image", body: null, caption: "La fachada" })).toBe("La fachada");
    expect(messagePreview({ messageType: "text", body: "Hola" })).toBe("Hola");
  });
});

describe("media_placeholder del historial", () => {
  it("se lee como texto, no como el tipo interno", async () => {
    const { messagePreview, displayMessageText } = await import("@/app/components/whatsapp/chat-shared");
    expect(messagePreview({ messageType: "media_placeholder", body: "[media_placeholder]" })).toBe("Archivo del historial");
    expect(displayMessageText("[media_placeholder]")).toBe("Archivo del historial");
  });
});
