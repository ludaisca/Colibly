import { describe, expect, it } from "vitest";
import { mediaEndpointFor } from "@/lib/whatsapp/media-shared";

// El id de un mensaje de Telegram/Messenger/Instagram es un ChannelMessage, no
// un WAMessage: pedir siempre /api/whatsapp/... daba 404 y el medio no se veía.
describe("mediaEndpointFor", () => {
  it("usa la ruta del canal del mensaje", () => {
    expect(mediaEndpointFor("m1", "WHATSAPP")).toBe("/api/whatsapp/messages/m1/media");
    expect(mediaEndpointFor("m1", "TELEGRAM")).toBe("/api/telegram/messages/m1/media");
    expect(mediaEndpointFor("m1", "MESSENGER")).toBe("/api/messenger/messages/m1/media");
    expect(mediaEndpointFor("m1", "INSTAGRAM")).toBe("/api/instagram/messages/m1/media");
  });

  it("el chat web no tiene medios", () => {
    expect(mediaEndpointFor("m1", "WEBCHAT")).toBeNull();
  });

  it("escapa el id", () => {
    expect(mediaEndpointFor("a/b", "TELEGRAM")).toBe("/api/telegram/messages/a%2Fb/media");
  });

  it("sin canal se mantiene la ruta de WhatsApp (compatibilidad)", () => {
    expect(mediaEndpointFor("m1")).toBe("/api/whatsapp/messages/m1/media");
  });
});
