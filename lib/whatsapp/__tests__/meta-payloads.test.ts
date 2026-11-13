import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WAAccount } from "@prisma/client";

vi.mock("@/lib/crypto", () => ({ decrypt: (s: string) => `dec:${s}` }));
vi.mock("@/lib/billing/gates", () => ({ assertOrgCanSend: vi.fn(async () => {}) }));

import { sendInteractiveCtaUrl, sendInteractiveList, sendInteractiveLocationRequest } from "@/lib/whatsapp/send-interactive";
import { markMessageRead, sendMessage } from "@/lib/whatsapp";
import { sendTemplateMessage } from "@/lib/whatsapp/send-template";

// Forma de cada payload según la documentación de la Cloud API de Meta.
const account = { organizationId: "o1", phoneNumberId: "PN", accessToken: "tok" } as unknown as WAAccount;
let bodies: Record<string, unknown>[] = [];

beforeEach(() => {
  bodies = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify({ messages: [{ id: "wamid.X" }], success: true }), { status: 200 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("payloads de Meta", () => {
  it("cta_url", async () => {
    await sendInteractiveCtaUrl(account, { to: "521", body: "Tu pedido", label: "Rastrear", url: "https://x.mx/p", replyToWamid: "wamid.Q" });
    expect(bodies[0]).toMatchObject({
      type: "interactive",
      context: { message_id: "wamid.Q" },
      interactive: { type: "cta_url", body: { text: "Tu pedido" }, action: { name: "cta_url", parameters: { display_text: "Rastrear", url: "https://x.mx/p" } } },
    });
  });

  it("pedir ubicación", async () => {
    await sendInteractiveLocationRequest(account, { to: "521", body: "¿Dónde estás?" });
    expect(bodies[0]).toMatchObject({ interactive: { type: "location_request_message", body: { text: "¿Dónde estás?" }, action: { name: "send_location" } } });
    expect(bodies[0]).not.toHaveProperty("context");
  });

  it("lista con cita", async () => {
    await sendInteractiveList(account, { to: "521", body: "Elige", buttonLabel: "Ver", rows: [{ id: "a", title: "A" }], replyToWamid: "wamid.Q" });
    expect(bodies[0]).toMatchObject({ context: { message_id: "wamid.Q" }, interactive: { type: "list", action: { button: "Ver" } } });
  });

  it("ubicación, sin campos vacíos", async () => {
    await sendMessage("PN", "tok", { to: "521", type: "location", location: { latitude: 19.4, longitude: -99.1, name: "Centro" } });
    expect(bodies[0]).toMatchObject({ type: "location", location: { latitude: 19.4, longitude: -99.1, name: "Centro" } });
    expect((bodies[0].location as object)).not.toHaveProperty("address");
  });

  it("plantilla citando", async () => {
    await sendTemplateMessage(account, { to: "521", templateName: "t", language: "es_MX", replyToWamid: "wamid.Q" });
    expect(bodies[0]).toMatchObject({ type: "template", context: { message_id: "wamid.Q" } });
  });

  it("marcar leído, con y sin escribiendo…", async () => {
    await markMessageRead("PN", "tok", "wamid.IN");
    await markMessageRead("PN", "tok", "wamid.IN", { typing: true });
    expect(bodies[0]).toEqual({ messaging_product: "whatsapp", status: "read", message_id: "wamid.IN" });
    expect(bodies[1]).toEqual({ messaging_product: "whatsapp", status: "read", message_id: "wamid.IN", typing_indicator: { type: "text" } });
  });
});
