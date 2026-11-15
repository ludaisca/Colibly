import { describe, expect, it } from "vitest";
import { outcomeContactSnapshot, outcomeScopeWhere } from "../outcome-scope";

const base = { accountIds: ["wa1"], channelAccountIds: ["ch1"], organizationId: "org1" };

describe("outcomeScopeWhere", () => {
  it("cuenta los eventos de contactos vivos y los de contactos borrados por la cuenta de la foto", () => {
    const where = outcomeScopeWhere({ ...base, isAdmin: false });
    expect(where.OR[0]).toEqual({ contact: { OR: [{ accountId: { in: ["wa1"] } }, { channelAccountId: { in: ["ch1"] } }] } });
    expect(where.OR[1]).toEqual({
      contactId: null,
      OR: [{ contactAccountId: { in: ["wa1"] } }, { contactChannelAccountId: { in: ["ch1"] } }],
    });
  });

  it("el admin también ve las ventas de contactos sin canal borrados de su organización", () => {
    const deleted = outcomeScopeWhere({ ...base, isAdmin: true }).OR[1] as { OR: unknown[] };
    expect(deleted.OR).toContainEqual({ contactAccountId: null, contactChannelAccountId: null, organizationId: "org1" });
  });

  it("quien no es admin no ve las de contactos sin canal", () => {
    const deleted = outcomeScopeWhere({ ...base, isAdmin: false }).OR[1] as { OR: unknown[] };
    expect(deleted.OR).toHaveLength(2);
  });
});

describe("outcomeContactSnapshot", () => {
  it("guarda el número en contactos de WhatsApp", () => {
    expect(outcomeContactSnapshot({ name: "Ana", remoteJid: "5215512345678@s.whatsapp.net", accountId: "wa1", channelAccountId: null })).toEqual({
      contactName: "Ana",
      contactPhone: "5215512345678",
      contactAccountId: "wa1",
      contactChannelAccountId: null,
    });
  });

  it("no toma el id externo de un canal genérico como número", () => {
    expect(outcomeContactSnapshot({ name: null, remoteJid: "998877", accountId: null, channelAccountId: "ch1" }).contactPhone).toBeNull();
  });
});
