import { describe, expect, it, vi } from "vitest";
import { completeEmbeddedSignup, EmbeddedSignupError, generateRegistrationPin, pickPhoneNumber, SYNC_WINDOW_HOURS, tokenExpiry, type EmbeddedSignupDeps, type EmbeddedSignupInput } from "../complete";

const NOW = new Date("2026-10-03T12:00:00Z");
const APP = { appId: "3423949611118312", appSecret: "secreto" };

function input(over: Partial<EmbeddedSignupInput> = {}): EmbeddedSignupInput {
  return { userId: "u1", organizationId: "o1", code: "CODE", wabaId: "waba1", phoneNumberId: "pn1", coexistenceRequested: false, coexistenceAllowed: true, ...over };
}

function deps(over: Partial<EmbeddedSignupDeps> = {}) {
  const created: unknown[] = [];
  const base: EmbeddedSignupDeps = {
    now: () => NOW,
    exchangeCodeForToken: vi.fn(async () => ({ accessToken: "TOKEN", expiresIn: 5_184_000 })),
    listWabaPhoneNumbers: vi.fn(async () => [{ id: "pn1", display_phone_number: "+52 55 6862 3317", verified_name: "Mi Negocio", is_on_biz_app: false }]),
    subscribeAppToWaba: vi.fn(async () => {}),
    registerPhoneNumber: vi.fn(async () => {}),
    lookupTokenUserId: vi.fn(async () => "meta-user-1"),
    generatePin: () => "123456",
    phoneNumberIdTaken: vi.fn(async () => false),
    uniqueAccountName: vi.fn(async (_u, d) => d),
    createAccount: vi.fn(async (data) => {
      created.push(data);
      return { id: "acc1" };
    }),
    enqueueCoexistenceSync: vi.fn(async () => {}),
  };
  return { d: { ...base, ...over }, created };
}

describe("completeEmbeddedSignup", () => {
  it("número nuevo: intercambia, suscribe, REGISTRA con PIN y crea la cuenta", async () => {
    const { d, created } = deps();
    const r = await completeEmbeddedSignup(input(), APP, d);
    expect(r).toMatchObject({ accountId: "acc1", coexistence: false, registered: true, syncDeadlineAt: null });
    expect(d.subscribeAppToWaba).toHaveBeenCalledWith("waba1", "TOKEN");
    expect(d.registerPhoneNumber).toHaveBeenCalledWith("pn1", "TOKEN", "123456");
    expect(d.enqueueCoexistenceSync).not.toHaveBeenCalled();
    expect(created[0]).toMatchObject({ name: "Mi Negocio", coexistence: false, twoStepPinPlain: "123456", appId: APP.appId, metaUserId: "meta-user-1" });
    expect((created[0] as { tokenExpiresAt: Date }).tokenExpiresAt.toISOString()).toBe("2026-12-02T12:00:00.000Z");
  });

  it("coexistencia (según Meta): NO registra, fija límite de 24 h y encola la sincronización", async () => {
    const { d, created } = deps({ listWabaPhoneNumbers: vi.fn(async () => [{ id: "pn1", display_phone_number: "5215568623317", is_on_biz_app: true }]) });
    const r = await completeEmbeddedSignup(input({ coexistenceRequested: true }), APP, d);
    expect(r.coexistence).toBe(true);
    expect(r.registered).toBe(false);
    expect(d.registerPhoneNumber).not.toHaveBeenCalled();
    expect(d.enqueueCoexistenceSync).toHaveBeenCalledWith("acc1");
    expect(r.syncDeadlineAt?.toISOString()).toBe(new Date(NOW.getTime() + SYNC_WINDOW_HOURS * 3_600_000).toISOString());
    expect(created[0]).toMatchObject({ coexistence: true, twoStepPinPlain: null });
  });

  it("manda Meta, no el navegador: aunque pida coexistencia, si no es número de la app se registra", async () => {
    const { d } = deps();
    const r = await completeEmbeddedSignup(input({ coexistenceRequested: true }), APP, d);
    expect(r.coexistence).toBe(false);
    expect(d.registerPhoneNumber).toHaveBeenCalled();
  });

  it("coexistencia sin permiso de la organización → 403 y no suscribe", async () => {
    const { d } = deps({ listWabaPhoneNumbers: vi.fn(async () => [{ id: "pn1", is_on_biz_app: true }]) });
    await expect(completeEmbeddedSignup(input({ coexistenceAllowed: false }), APP, d)).rejects.toMatchObject({ status: 403, code: "coexistence_disabled" });
    expect(d.subscribeAppToWaba).not.toHaveBeenCalled();
    expect(d.createAccount).not.toHaveBeenCalled();
  });

  it("número ya conectado → 409 antes de llamar a Meta", async () => {
    const { d } = deps({ phoneNumberIdTaken: vi.fn(async () => true) });
    await expect(completeEmbeddedSignup(input(), APP, d)).rejects.toMatchObject({ status: 409, code: "phone_in_use" });
    expect(d.exchangeCodeForToken).not.toHaveBeenCalled();
  });

  it("phone_number_id que no es de esa WABA → 400", async () => {
    const { d } = deps({ listWabaPhoneNumbers: vi.fn(async () => [{ id: "OTRO" }]) });
    await expect(completeEmbeddedSignup(input(), APP, d)).rejects.toMatchObject({ status: 400, code: "phone_not_in_waba" });
    expect(d.createAccount).not.toHaveBeenCalled();
  });

  it("fallos de Meta se traducen a errores 502 con su código", async () => {
    const boom = (m: string) => vi.fn(async () => { throw new Error(m); });
    await expect(completeEmbeddedSignup(input(), APP, deps({ exchangeCodeForToken: boom("code expired") }).d)).rejects.toMatchObject({ status: 502, code: "token_exchange_failed" });
    await expect(completeEmbeddedSignup(input(), APP, deps({ subscribeAppToWaba: boom("x") }).d)).rejects.toMatchObject({ code: "subscribe_failed" });
    await expect(completeEmbeddedSignup(input(), APP, deps({ registerPhoneNumber: boom("x") }).d)).rejects.toMatchObject({ code: "register_failed" });
    await expect(completeEmbeddedSignup(input(), APP, deps({ listWabaPhoneNumbers: boom("x") }).d)).rejects.toBeInstanceOf(EmbeddedSignupError);
  });

  it("sin vigencia informada por Meta, tokenExpiresAt queda en null", async () => {
    const { d, created } = deps({ exchangeCodeForToken: vi.fn(async () => ({ accessToken: "T", expiresIn: null })) });
    await completeEmbeddedSignup(input(), APP, d);
    expect((created[0] as { tokenExpiresAt: Date | null }).tokenExpiresAt).toBeNull();
  });
});

describe("sin phone_number_id (evento de coexistencia)", () => {
  const biz = { id: "pnBiz", display_phone_number: "5215568623317", is_on_biz_app: true };

  it("toma el número de la app WhatsApp Business y arma la coexistencia", async () => {
    const { d, created } = deps({ listWabaPhoneNumbers: vi.fn(async () => [{ id: "pnOtro", is_on_biz_app: false }, biz]) });
    const r = await completeEmbeddedSignup(input({ phoneNumberId: null, coexistenceRequested: true }), APP, d);
    expect(r.coexistence).toBe(true);
    expect(created[0]).toMatchObject({ phoneNumberId: "pnBiz", coexistence: true });
    expect(d.registerPhoneNumber).not.toHaveBeenCalled();
  });
  it("varios números sin poder distinguir → 409 y no crea nada", async () => {
    const { d } = deps({ listWabaPhoneNumbers: vi.fn(async () => [{ id: "a" }, { id: "b" }]) });
    await expect(completeEmbeddedSignup(input({ phoneNumberId: null }), APP, d)).rejects.toMatchObject({ status: 409, code: "ambiguous_phone" });
    expect(d.createAccount).not.toHaveBeenCalled();
  });
  it("cuenta sin números → 400", async () => {
    const { d } = deps({ listWabaPhoneNumbers: vi.fn(async () => []) });
    await expect(completeEmbeddedSignup(input({ phoneNumberId: null }), APP, d)).rejects.toMatchObject({ status: 400, code: "no_phone" });
  });
  it("el número resuelto ya conectado en otra cuenta → 409", async () => {
    const { d } = deps({ listWabaPhoneNumbers: vi.fn(async () => [biz]), phoneNumberIdTaken: vi.fn(async () => true) });
    await expect(completeEmbeddedSignup(input({ phoneNumberId: null, coexistenceRequested: true }), APP, d)).rejects.toMatchObject({ status: 409, code: "phone_in_use" });
    expect(d.subscribeAppToWaba).not.toHaveBeenCalled();
  });
  it("pickPhoneNumber", () => {
    expect(pickPhoneNumber([{ id: "a" }], false)).toEqual({ id: "a" });
    expect(pickPhoneNumber([{ id: "a" }, { id: "b", is_on_biz_app: true }], true)).toEqual({ id: "b", is_on_biz_app: true });
    expect(pickPhoneNumber([{ id: "a" }, { id: "b" }], true)).toBe("ambiguous");
    expect(pickPhoneNumber([], false)).toBeUndefined();
  });
});

describe("helpers", () => {
  it("PIN de 6 dígitos con ceros a la izquierda", () => {
    for (let i = 0; i < 200; i++) expect(generateRegistrationPin()).toMatch(/^\d{6}$/);
  });
  it("tokenExpiry", () => {
    expect(tokenExpiry(NOW, 60)?.toISOString()).toBe("2026-10-03T12:01:00.000Z");
    expect(tokenExpiry(NOW, null)).toBeNull();
    expect(tokenExpiry(NOW, 0)).toBeNull();
  });
});
