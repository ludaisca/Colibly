import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@/lib/crypto", () => ({ decrypt: (s: string) => `dec:${s}` }));

import {
  blockUsers,
  buildBusinessProfilePayload,
  deleteMetaTemplate,
  getBusinessProfile,
  MetaAdminError,
  parseBlockedList,
  parseBlockResponse,
  parseBusinessProfile,
  unblockUsers,
} from "@/lib/whatsapp/account-admin";

const account = { phoneNumberId: "pn1", wabaId: "waba1", accessToken: "enc" };
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(async (..._a: unknown[]) => new Response(JSON.stringify(body), { status }));
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

describe("perfil de empresa", () => {
  it("lee la forma de Meta y deja vacíos en null", () => {
    expect(parseBusinessProfile({ data: [{ about: "Hola", websites: ["https://a.mx"], vertical: "RETAIL", email: "" }] })).toEqual({
      about: "Hola", address: null, description: null, email: null, websites: ["https://a.mx"], vertical: "RETAIL", profilePictureUrl: null,
    });
    expect(parseBusinessProfile(null).websites).toEqual([]);
  });

  it("solo manda los campos dados, con los nombres de Meta", () => {
    expect(buildBusinessProfilePayload({ about: "Hola", email: "", profilePictureHandle: "h1" })).toEqual({
      messaging_product: "whatsapp", about: "Hola", email: "", profile_picture_handle: "h1",
    });
  });

  it("pide los campos al número con el token descifrado", async () => {
    const fn = mockFetch(200, { data: [{ about: "x" }] });
    await getBusinessProfile(account);
    const url = new URL(String(fn.mock.calls[0][0]));
    expect(url.pathname).toMatch(/\/pn1\/whatsapp_business_profile$/);
    expect(url.searchParams.get("fields")).toContain("profile_picture_url");
    expect((fn.mock.calls[0][1] as RequestInit).headers).toMatchObject({ Authorization: "Bearer dec:enc" });
  });

  it("un error de Meta lanza MetaAdminError con su mensaje para la persona", async () => {
    mockFetch(400, { error: { message: "(#100) Invalid parameter", error_user_msg: "El correo no es válido", code: 100 } });
    const err = await getBusinessProfile(account).catch((e) => e);
    expect(err).toBeInstanceOf(MetaAdminError);
    expect(err).toMatchObject({ message: "El correo no es válido", metaCode: 100, httpStatus: 400 });
  });

  it("sin Phone Number ID responde 422 sin llamar a Meta", async () => {
    const fn = mockFetch(200, {});
    await expect(getBusinessProfile({ ...account, phoneNumberId: null })).rejects.toMatchObject({ httpStatus: 422 });
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("bloqueos", () => {
  it("separa aplicados y fallidos; lo que Meta no menciona cuenta como fallido", () => {
    const result = parseBlockResponse(
      { block_users: { added_users: [{ input: "5215511111111", wa_id: "5215511111111" }], failed_users: [{ input: "5215522222222", errors: [{ message: "x", error_data: { details: "No escribió en 24 h" } }] }] } },
      "added_users",
      ["5215511111111", "5215522222222", "5215533333333"]
    );
    expect(result.done).toEqual([{ input: "5215511111111", waId: "5215511111111" }]);
    expect(result.failed).toEqual([
      { input: "5215522222222", error: "No escribió en 24 h" },
      { input: "5215533333333", error: "Meta no confirmó el cambio" },
    ]);
  });

  it("bloquear manda POST con la forma de Meta y acepta el 400 con resultados parciales", async () => {
    const fn = mockFetch(400, {
      block_users: { added_users: [{ input: "5215511111111", wa_id: "5215511111111" }], failed_users: [{ input: "5215522222222", errors: [{ message: "Fuera de 24 h" }] }] },
      error: { message: "Failed to block some users" },
    });
    const result = await blockUsers(account, ["5215511111111", "5215522222222"]);
    const [url, init] = fn.mock.calls[0] as [string, RequestInit];
    expect(new URL(url).pathname).toMatch(/\/pn1\/block_users$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ messaging_product: "whatsapp", block_users: [{ user: "5215511111111" }, { user: "5215522222222" }] });
    expect(result.done).toHaveLength(1);
    expect(result.failed).toEqual([{ input: "5215522222222", error: "Fuera de 24 h" }]);
  });

  it("un error sin lista es un MetaAdminError", async () => {
    mockFetch(401, { error: { message: "Token vencido" } });
    await expect(blockUsers(account, ["5215511111111"])).rejects.toBeInstanceOf(MetaAdminError);
  });

  it("desbloquear usa DELETE y lee removed_users", async () => {
    const fn = mockFetch(200, { block_users: { removed_users: [{ input: "5215511111111", wa_id: "5215511111111" }] } });
    const result = await unblockUsers(account, ["5215511111111"]);
    expect((fn.mock.calls[0][1] as RequestInit).method).toBe("DELETE");
    expect(result).toEqual({ done: [{ input: "5215511111111", waId: "5215511111111" }], failed: [] });
  });

  it("la lista aplana data[].block_users[] y solo da cursor si hay página siguiente", () => {
    expect(parseBlockedList({ data: [{ block_users: [{ wa_id: "1" }, { wa_id: "2" }] }], paging: { cursors: { after: "c1" }, next: "https://graph…" } }))
      .toEqual({ waIds: ["1", "2"], nextCursor: "c1" });
    expect(parseBlockedList({ data: [{ wa_id: "3" }], paging: { cursors: { after: "c2" } } })).toEqual({ waIds: ["3"], nextCursor: null });
  });
});

describe("deleteMetaTemplate", () => {
  it("borra solo ese idioma (name + hsm_id) en la WABA", async () => {
    const fn = mockFetch(200, { success: true });
    await deleteMetaTemplate(account, { name: "promo", templateId: "123" });
    const [url, init] = fn.mock.calls[0] as [string, RequestInit];
    const parsed = new URL(url);
    expect(parsed.pathname).toMatch(/\/waba1\/message_templates$/);
    expect(parsed.searchParams.get("name")).toBe("promo");
    expect(parsed.searchParams.get("hsm_id")).toBe("123");
    expect(init.method).toBe("DELETE");
  });
});
