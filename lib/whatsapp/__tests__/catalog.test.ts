import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@/lib/crypto", () => ({ decrypt: (s: string) => `dec:${s}` }));
vi.mock("@/lib/billing/gates", () => ({ assertOrgCanSend: vi.fn() }));

import { catalogInteractive } from "@/lib/whatsapp/send-interactive";
import { parseCommerceSettings, resolveCatalogId, updateCommerceSettings } from "@/lib/whatsapp/account-admin";
import { orderTotal } from "@/lib/whatsapp/order";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

describe("catalogInteractive (forma de Meta)", () => {
  it("un producto", () => {
    expect(catalogInteractive({ kind: "product", catalogId: "123", productId: "SKU-1", body: "Mira", footer: "Envío gratis" })).toEqual({
      type: "product",
      body: { text: "Mira" },
      footer: { text: "Envío gratis" },
      action: { catalog_id: "123", product_retailer_id: "SKU-1" },
    });
    expect(catalogInteractive({ kind: "product", catalogId: "123", productId: "SKU-1" })).toEqual({ type: "product", action: { catalog_id: "123", product_retailer_id: "SKU-1" } });
  });

  it("una lista con secciones", () => {
    expect(catalogInteractive({ kind: "product_list", catalogId: "123", header: "Ofertas", body: "Lo más vendido", sections: [{ title: "Sillas", productIds: ["A", "B"] }] })).toEqual({
      type: "product_list",
      header: { type: "text", text: "Ofertas" },
      body: { text: "Lo más vendido" },
      action: { catalog_id: "123", sections: [{ title: "Sillas", product_items: [{ product_retailer_id: "A" }, { product_retailer_id: "B" }] }] },
    });
  });

  it("el botón Ver catálogo, con o sin miniatura", () => {
    expect(catalogInteractive({ kind: "catalog", body: "Todo", thumbnailProductId: "A" })).toEqual({
      type: "catalog_message",
      body: { text: "Todo" },
      action: { name: "catalog_message", parameters: { thumbnail_product_retailer_id: "A" } },
    });
    expect(catalogInteractive({ kind: "catalog", body: "Todo" })).toEqual({ type: "catalog_message", body: { text: "Todo" }, action: { name: "catalog_message" } });
  });
});

describe("ajustes de comercio", () => {
  it("lee los dos interruptores (apagados si Meta no tiene nada)", () => {
    expect(parseCommerceSettings({ data: [{ is_cart_enabled: true, is_catalog_visible: false }] })).toEqual({ cartEnabled: true, catalogVisible: false });
    expect(parseCommerceSettings({ data: [] })).toEqual({ cartEnabled: false, catalogVisible: false });
  });

  it("los cambia como parámetros de la URL, solo los dados", async () => {
    const fn = vi.fn(async (..._a: unknown[]) => new Response(JSON.stringify({ success: true }), { status: 200 }));
    globalThis.fetch = fn as unknown as typeof fetch;
    await updateCommerceSettings({ phoneNumberId: "pn1", wabaId: "w", accessToken: "enc" }, { cartEnabled: true });
    const url = new URL(String(fn.mock.calls[0][0]));
    expect(url.pathname).toMatch(/\/pn1\/whatsapp_commerce_settings$/);
    expect(url.searchParams.get("is_cart_enabled")).toBe("true");
    expect(url.searchParams.has("is_catalog_visible")).toBe(false);
  });
});

describe("resolveCatalogId", () => {
  const account = { id: "accX", phoneNumberId: "pn1", wabaId: "waba1", accessToken: "enc" };
  const catalogs = (data: unknown[]) => {
    globalThis.fetch = (async () => new Response(JSON.stringify({ data }), { status: 200 })) as unknown as typeof fetch;
  };

  it("usa el dado sin preguntar a Meta", async () => {
    const fn = vi.fn();
    globalThis.fetch = fn as unknown as typeof fetch;
    expect(await resolveCatalogId(account, "999")).toBe("999");
    expect(fn).not.toHaveBeenCalled();
  });

  it("sin dado: el único conectado; ninguno o varios es error del integrador", async () => {
    catalogs([{ id: "111", name: "Uno" }]);
    expect(await resolveCatalogId({ ...account, id: "acc-one" })).toBe("111");
    catalogs([]);
    await expect(resolveCatalogId({ ...account, id: "acc-none" })).rejects.toMatchObject({ httpStatus: 422 });
    catalogs([{ id: "1" }, { id: "2" }]);
    await expect(resolveCatalogId({ ...account, id: "acc-many" })).rejects.toThrow(/catalogId/);
  });
});

describe("orderTotal", () => {
  const item = (price: number | null, quantity: number | null, currency: string | null = "MXN") => ({ productId: "A", price, quantity, currency });
  it("suma precio × cantidad en una moneda, redondeado a centavos", () => {
    expect(orderTotal({ catalogId: "1", text: null, items: [item(1499.99, 2), item(0.1, 3)] })).toEqual({ total: 3000.28, currency: "MXN" });
  });
  it("no adivina: falta un dato, varias monedas o pedido vacío dan null", () => {
    expect(orderTotal({ catalogId: "1", text: null, items: [item(10, null)] }).total).toBeNull();
    expect(orderTotal({ catalogId: "1", text: null, items: [item(10, 1, "MXN"), item(10, 1, "USD")] })).toEqual({ total: null, currency: null });
    expect(orderTotal({ catalogId: "1", text: null, items: [] }).total).toBeNull();
  });
});
