import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const upsert = vi.fn(async (..._a: unknown[]) => ({}));
const findMany = vi.fn();
const updateMany = vi.fn(async (..._a: unknown[]) => ({ count: 1 }));
const leadUpdateMany = vi.fn(async (..._a: unknown[]) => ({ count: 0 }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    wATemplate: { upsert: (...a: unknown[]) => upsert(...a), findMany: (...a: unknown[]) => findMany(...a), updateMany: (...a: unknown[]) => updateMany(...a) },
    leadSheetSource: { updateMany: (...a: unknown[]) => leadUpdateMany(...a) },
    $transaction: async (ops: unknown[]) => Promise.all(ops),
    wAAccount: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/crypto", () => ({ decrypt: (s: string) => `dec:${s}` }));
const rateLimit = vi.fn();
vi.mock("@/lib/rate-limit", () => ({ rateLimit: (...a: unknown[]) => rateLimit(...a) }));

import { syncAccountTemplates, TemplateSyncError } from "@/lib/whatsapp/template-sync";
import type { WAAccount } from "@prisma/client";

const account = { id: "acc1", channel: "META_CLOUD", wabaId: "waba1", accessToken: "enc" } as unknown as WAAccount;
const realFetch = globalThis.fetch;

function metaPage(data: unknown[]) {
  return new Response(JSON.stringify({ data }), { status: 200 });
}

describe("syncAccountTemplates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findMany.mockResolvedValue([]);
  });
  afterEach(() => { globalThis.fetch = realFetch; });

  it("rechaza una cuenta sin WABA o token", async () => {
    await expect(syncAccountTemplates({ ...account, wabaId: null } as WAAccount)).rejects.toMatchObject({ code: "not_configured" });
  });

  it("pide los campos con el motivo de rechazo y guarda estado, motivo y componentes", async () => {
    const fetchMock = vi.fn(async (..._a: unknown[]) => metaPage([
      { id: "1", name: "ok", language: "es_MX", category: "UTILITY", status: "APPROVED", components: [{ type: "BODY", text: "hola" }], rejected_reason: "NONE" },
      { id: "2", name: "mal", language: "es", category: "MARKETING", status: "REJECTED", components: [], rejected_reason: "INVALID_FORMAT" },
    ]));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await syncAccountTemplates(account);

    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.pathname).toContain("/waba1/message_templates");
    expect(url.searchParams.get("fields")).toContain("rejected_reason");
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({ Authorization: "Bearer dec:enc" });

    const [ok, bad] = upsert.mock.calls.map((c) => (c[0] as { create: Record<string, unknown> }).create);
    expect(ok).toMatchObject({ templateId: "1", status: "APPROVED", statusReason: null });
    expect(bad).toMatchObject({ templateId: "2", status: "REJECTED", statusReason: "INVALID_FORMAT" });
  });

  it("marca como DELETED (sin borrar) las que Meta ya no devuelve y desactiva sus fuentes", async () => {
    globalThis.fetch = (async () => metaPage([{ id: "1", name: "a", language: "es", category: "UTILITY", status: "APPROVED", components: [] }])) as unknown as typeof fetch;
    findMany.mockResolvedValueOnce([{ id: "old1" }]).mockResolvedValue([]);
    await syncAccountTemplates(account);
    expect(updateMany.mock.calls[0][0]).toMatchObject({ where: { id: { in: ["old1"] } }, data: { status: "DELETED" } });
    expect(leadUpdateMany.mock.calls[0][0]).toMatchObject({ where: { waTemplateId: { in: ["old1"] } }, data: { enabled: false } });
  });

  it("un error de Meta se reporta como upstream con su mensaje", async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: { message: "Token inválido" } }), { status: 401 })) as unknown as typeof fetch;
    const err = await syncAccountTemplates(account).catch((e) => e);
    expect(err).toBeInstanceOf(TemplateSyncError);
    expect(err).toMatchObject({ code: "upstream", message: "Token inválido" });
  });
});
