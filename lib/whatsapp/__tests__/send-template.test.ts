import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/billing/gates", () => ({ assertOrgCanSend: vi.fn(async () => {}) }));
vi.mock("@/lib/crypto", () => ({ decrypt: (s: string) => `dec:${s}` }));

import { sendTemplateMessage } from "@/lib/whatsapp/send-template";
import type { WAAccount } from "@prisma/client";

const account = { organizationId: "org", accessToken: "enc", phoneNumberId: "pn1" } as unknown as WAAccount;
const realFetch = globalThis.fetch;
let sent: Record<string, unknown> | null = null;

describe("sendTemplateMessage — cabecera con medio", () => {
  beforeEach(() => {
    sent = null;
    globalThis.fetch = (async (_u: unknown, init: RequestInit) => {
      sent = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ messages: [{ id: "wamid.X" }] }), { status: 200 });
    }) as unknown as typeof fetch;
  });
  afterEach(() => { globalThis.fetch = realFetch; });

  const header = () => ((sent!.template as { components: Array<{ type: string; parameters: unknown[] }> }).components.find((c) => c.type === "header")!.parameters[0]);

  it("una URL https va como link", async () => {
    await sendTemplateMessage(account, { to: "5215512345678", templateName: "t", language: "es", headerFormat: "IMAGE", headerParam: "https://ejemplo.mx/foto.jpg" });
    expect(header()).toEqual({ type: "image", image: { link: "https://ejemplo.mx/foto.jpg" } });
  });

  it("un id de medio de Meta sigue yendo como id", async () => {
    await sendTemplateMessage(account, { to: "5215512345678", templateName: "t", language: "es", headerFormat: "DOCUMENT", headerParam: "1234567890" });
    expect(header()).toEqual({ type: "document", document: { id: "1234567890" } });
  });

  it("la cabecera de texto no cambia", async () => {
    await sendTemplateMessage(account, { to: "5215512345678", templateName: "t", language: "es", headerFormat: "TEXT", headerParam: "A-1043" });
    expect(header()).toEqual({ type: "text", text: "A-1043" });
  });
});
