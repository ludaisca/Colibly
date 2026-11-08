import { describe, expect, it } from "vitest";
import { plural, pluralWord } from "../plural";

describe("plural", () => {
  it("singular solo con 1", () => {
    expect(plural(1, "chat")).toBe("1 chat");
    expect(plural(0, "chat")).toBe("0 chats");
    expect(plural(2, "abierto")).toBe("2 abiertos");
  });
  it("plural irregular explícito", () => {
    expect(pluralWord(2, "canal", "canales")).toBe("canales");
    expect(pluralWord(1, "canal", "canales")).toBe("canal");
    expect(pluralWord(2, "bot")).toBe("bots");
  });
  it("plural explícito y miles", () => {
    expect(plural(2, "organización", "organizaciones")).toBe("2 organizaciones");
    expect(plural(1200, "contacto")).toBe("1,200 contactos");
  });
});
