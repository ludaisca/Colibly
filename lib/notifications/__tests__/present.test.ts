import { describe, expect, it } from "vitest";
import { chatRefFromLink, notificationGroup, readableNotificationText } from "../present";

describe("chatRefFromLink", () => {
  it("lee cuenta y chat del enlace de la bandeja", () => {
    expect(chatRefFromLink("/whatsapp/chat/acc1/chat2")).toEqual({ accountId: "acc1", chatId: "chat2" });
    expect(chatRefFromLink("/whatsapp/chat/acc1/chat2?mensaje=m1")).toEqual({ accountId: "acc1", chatId: "chat2" });
  });
  it("ignora otros enlaces", () => {
    expect(chatRefFromLink("/whatsapp/chat?assigned=me")).toBeNull();
    expect(chatRefFromLink("/whatsapp/citas")).toBeNull();
    expect(chatRefFromLink(null)).toBeNull();
  });
});

describe("readableNotificationText", () => {
  it("cambia el id de visitante por su etiqueta", () => {
    expect(readableNotificationText("v_oW3a7o6NJHn6wu8zJBsCAMJt")).toBe("Visitante web · AMJT");
  });
  it("no toca textos normales", () => {
    expect(readableNotificationText("Carla")).toBe("Carla");
    expect(readableNotificationText("Chat asignado")).toBe("Chat asignado");
    expect(readableNotificationText(null)).toBeNull();
  });
});

describe("notificationGroup", () => {
  const now = new Date(2026, 10, 1, 10, 0);
  it("agrupa por día local", () => {
    expect(notificationGroup(new Date(2026, 10, 1, 0, 1).toISOString(), now)).toBe("Hoy");
    expect(notificationGroup(new Date(2026, 9, 31, 23, 59).toISOString(), now)).toBe("Ayer");
    expect(notificationGroup(new Date(2026, 9, 31, 0, 0).toISOString(), now)).toBe("Ayer");
    expect(notificationGroup(new Date(2026, 9, 30, 23, 59).toISOString(), now)).toBe("Anteriores");
  });
});
