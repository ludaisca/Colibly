import { describe, expect, it } from "vitest";
import { buildContactScope, isChannellessContact } from "../scope";
import { orgContactsWhere } from "../org-where";

describe("buildContactScope", () => {
  const base = { accountIds: ["wa1"], channelAccountIds: ["ch1"], organizationId: "org1" };
  it("el admin ve sus cuentas y los contactos sin canal de su organización", () => {
    const { OR } = buildContactScope({ ...base, isAdmin: true });
    expect(OR).toHaveLength(3);
    expect(OR[2]).toEqual({ accountId: null, channelAccountId: null, organizationId: "org1" });
  });
  it("un usuario o ejecutivo solo ve sus cuentas: nunca los sin canal", () => {
    const { OR } = buildContactScope({ ...base, isAdmin: false });
    expect(OR).toEqual([{ accountId: { in: ["wa1"] } }, { channelAccountId: { in: ["ch1"] } }]);
  });
  it("sin organización no abre el alcance sin canal, aunque sea admin", () => {
    expect(buildContactScope({ ...base, organizationId: null, isAdmin: true }).OR).toHaveLength(2);
  });
  it("otra organización queda fuera: el alcance lleva su propio organizationId", () => {
    const a = buildContactScope({ ...base, isAdmin: true }).OR[2];
    const b = buildContactScope({ accountIds: [], channelAccountIds: [], organizationId: "org2", isAdmin: true }).OR[2];
    expect(a).not.toEqual(b);
  });
});

describe("isChannellessContact", () => {
  it("sin cuenta ni canal", () => {
    expect(isChannellessContact({ accountId: null, channelAccountId: null })).toBe(true);
    expect(isChannellessContact({ accountId: "a" })).toBe(false);
  });
});

describe("orgContactsWhere", () => {
  it("cuenta cuentas, canales y sin canal, y deja fuera los de ejemplo", () => {
    const w = orgContactsWhere("org1");
    expect(w.isSample).toBe(false);
    expect(w.OR).toHaveLength(3);
  });
});

describe("los datos de ejemplo no llegan a estadísticas ni límites", () => {
  it("el alcance por cuentas (estadísticas, API v1) nunca incluye contactos sin cuenta", () => {
    // Estadísticas y la API v1 filtran por accountId/channelAccountId de la persona:
    // un contacto de ejemplo (sin cuenta) no puede coincidir con un `in: [...]`.
    const { OR } = buildContactScope({ accountIds: ["wa1"], channelAccountIds: [], organizationId: "org1", isAdmin: false });
    expect(OR.every((c) => !("organizationId" in c))).toBe(true);
  });
  it("los conteos del plan excluyen isSample", () => {
    expect(orgContactsWhere("org1")).toMatchObject({ isSample: false });
  });
});
