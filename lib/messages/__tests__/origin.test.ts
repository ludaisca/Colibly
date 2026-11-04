import { describe, expect, it } from "vitest";
import { legacySourceOf, messageOrigin, sentByOf } from "../origin";

describe("messageOrigin", () => {
  it("usa sentVia cuando existe", () => {
    expect(messageOrigin({ direction: "OUTBOUND", sentVia: "bot" })).toBe("bot");
    expect(messageOrigin({ direction: "OUTBOUND", sentVia: "campaign", senderId: "u1" })).toBe("campaign");
  });
  it("deduce filas anteriores a sentVia", () => {
    expect(messageOrigin({ direction: "OUTBOUND", origin: "BUSINESS_APP_ECHO" })).toBe("business_app");
    expect(messageOrigin({ direction: "OUTBOUND", origin: "API", campaignId: "c1" })).toBe("campaign");
    expect(messageOrigin({ direction: "OUTBOUND", origin: "API", recoveryAttempt: { id: "r" } })).toBe("recovery");
    expect(messageOrigin({ direction: "OUTBOUND", origin: "API", leadSheetSourceId: "s" })).toBe("automation");
    expect(messageOrigin({ direction: "OUTBOUND", origin: "API", senderId: "u1" })).toBe("agent");
    expect(messageOrigin({ direction: "OUTBOUND", origin: "API" })).toBeNull();
  });
  it("entrantes: contact, o history si es importado", () => {
    expect(messageOrigin({ direction: "INBOUND", origin: "API" })).toBe("contact");
    expect(messageOrigin({ direction: "INBOUND", origin: "HISTORY" })).toBe("history");
    expect(messageOrigin({ direction: "OUTBOUND", origin: "HISTORY", sentVia: "history" })).toBe("history");
  });
  it("ignora un sentVia desconocido", () => {
    expect(messageOrigin({ direction: "OUTBOUND", sentVia: "otro", senderId: "u1" })).toBe("agent");
  });
});

describe("sentByOf", () => {
  it("mapea origen a quién", () => {
    expect(sentByOf("contact", "INBOUND")).toBe("contact");
    expect(sentByOf("history", "INBOUND")).toBe("contact");
    expect(sentByOf("agent", "OUTBOUND", "u1")).toBe("user");
    expect(sentByOf("bot", "OUTBOUND")).toBe("bot");
    expect(sentByOf("business_app", "OUTBOUND")).toBe("business_app");
    expect(sentByOf("history", "OUTBOUND")).toBe("business_app");
    expect(sentByOf("campaign", "OUTBOUND")).toBe("system");
    expect(sentByOf("automation", "OUTBOUND", "u1")).toBe("user"); // macro aplicada por alguien
    expect(sentByOf(null, "OUTBOUND")).toBeNull();
  });
});

describe("legacySourceOf", () => {
  it("conserva los 3 valores originales de source", () => {
    expect(legacySourceOf("agent")).toBe("agent");
    expect(legacySourceOf("business_app")).toBe("agent");
    expect(legacySourceOf("api")).toBe("api");
    for (const o of ["automation", "bot", "campaign", "sequence", "recovery", "system"] as const) expect(legacySourceOf(o)).toBe("automation");
  });
});
