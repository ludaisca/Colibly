import { describe, expect, it } from "vitest";
import { normalizeCampaignRecipients } from "../recipients";

describe("normalizeCampaignRecipients", () => {
  it("las formas de un mismo número de México son un solo destinatario", () => {
    const r = normalizeCampaignRecipients([{ phoneNumber: "5512345678" }, { phoneNumber: "+52 55 1234 5678" }, { phoneNumber: "5215512345678" }]);
    expect(r).toEqual({ ok: true, recipients: [{ phoneNumber: "525512345678" }], duplicates: 2 });
  });
  it("conserva nombre y parámetros del primero", () => {
    const r = normalizeCampaignRecipients([{ phoneNumber: "55 8765 4321", contactName: "Ana", parameters: { "1": "Ana" } }]);
    expect(r.ok && r.recipients[0]).toEqual({ phoneNumber: "525587654321", contactName: "Ana", parameters: { "1": "Ana" } });
  });
  it("rechaza un número corto o con letras indicando la fila", () => {
    const r = normalizeCampaignRecipients([{ phoneNumber: "5512345678" }, { phoneNumber: "5512345679" }, { phoneNumber: "55 12" }]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.row).toBe(3);
      expect(r.error).toContain("“55 12” de la fila 3");
    }
    expect(normalizeCampaignRecipients([{ phoneNumber: "abc123456789" }]).ok).toBe(false);
  });
  it("otros países se respetan", () => {
    const r = normalizeCampaignRecipients([{ phoneNumber: "+1 415 555 2671" }]);
    expect(r.ok && r.recipients[0].phoneNumber).toBe("14155552671");
  });
});
