import { describe, expect, it } from "vitest";
import { replyParameters, telegramReactionEmoji } from "@/lib/telegram";

describe("citas y reacciones de Telegram", () => {
  it("traduce las reacciones de WhatsApp a emoji que Telegram acepta", () => {
    expect(telegramReactionEmoji("👍")).toBe("👍");
    expect(telegramReactionEmoji("❤️")).toBe("❤");
    expect(telegramReactionEmoji("😂")).toBe("🤣");
    expect(telegramReactionEmoji("😮")).toBe("😱");
    expect(telegramReactionEmoji("")).toBeNull();
    expect(telegramReactionEmoji("🚀")).toBeNull();
  });

  it("arma la cita solo con un message_id numérico", () => {
    expect(replyParameters("42")).toEqual({ message_id: 42 });
    expect(replyParameters("cb_1")).toBeNull();
    expect(replyParameters(undefined)).toBeNull();
  });
});
