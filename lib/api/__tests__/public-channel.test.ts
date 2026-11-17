import { describe, expect, it } from "vitest";
import { isPublicWhatsapp, publicChannel, publicPhone } from "../public-channel";

describe("canal oculto hacia afuera", () => {
  it("WhatsApp por QR sale como WhatsApp; los demás, igual", () => {
    expect(publicChannel("WHATSAPP_WEB")).toBe("WHATSAPP");
    expect(publicChannel("TELEGRAM")).toBe("TELEGRAM");
    expect(publicChannel(null)).toBeNull();
  });
  it("cuenta como WhatsApp la de Meta y la de QR", () => {
    expect(isPublicWhatsapp({ waAccountId: "wa1" })).toBe(true);
    expect(isPublicWhatsapp({ channel: "WHATSAPP_WEB" })).toBe(true);
    expect(isPublicWhatsapp({ channel: "WEBCHAT" })).toBe(false);
  });
  it("el teléfono sale en dígitos aunque el contacto de QR guarde un JID", () => {
    expect(publicPhone("5215511112222@s.whatsapp.net")).toBe("5215511112222");
    expect(publicPhone("5215511112222")).toBe("5215511112222");
  });
});
