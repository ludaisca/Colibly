import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/crypto", () => ({ decrypt: (s: string) => s }));
vi.mock("@/lib/billing/gates", () => ({ assertOrgCanSend: vi.fn() }));

import { flowInteractive } from "@/lib/whatsapp/send-interactive";
import { getMessageBody, parseFlowResponse, structuredContentOf } from "@/lib/whatsapp/message-content";

describe("flowInteractive (forma de Meta)", () => {
  it("con pantalla: navigate con sus datos, y draft si se pide", () => {
    expect(flowInteractive({ flowId: "123", cta: "Agendar", body: "Agenda tu visita", header: "Citas", footer: "Toma 1 minuto", flowToken: "t1", screen: "CITA", data: { sucursal: "centro" }, draft: true })).toEqual({
      type: "flow",
      header: { type: "text", text: "Citas" },
      body: { text: "Agenda tu visita" },
      footer: { text: "Toma 1 minuto" },
      action: {
        name: "flow",
        parameters: {
          flow_message_version: "3",
          flow_token: "t1",
          flow_id: "123",
          flow_cta: "Agendar",
          mode: "draft",
          flow_action: "navigate",
          flow_action_payload: { screen: "CITA", data: { sucursal: "centro" } },
        },
      },
    });
  });

  it("sin pantalla: data_exchange (el Flow pide datos a su endpoint)", () => {
    const params = (flowInteractive({ flowId: "123", cta: "Abrir", body: "x", flowToken: "t" }).action as { parameters: Record<string, unknown> }).parameters;
    expect(params.flow_action).toBe("data_exchange");
    expect(params).not.toHaveProperty("flow_action_payload");
    expect(params).not.toHaveProperty("mode");
  });
});

describe("respuesta de un Flow (nfm_reply)", () => {
  const reply = (response_json?: string) => ({
    type: "interactive",
    interactive: { type: "nfm_reply", nfm_reply: { name: "flow", body: "Sent", response_json } },
  });

  it("separa el token de los campos y deja un texto legible", () => {
    const msg = reply(JSON.stringify({ flow_token: "cita-1", fecha: "2026-11-20", sucursal: "centro" }));
    expect(getMessageBody(msg)).toBe("📝 Respondió el formulario");
    expect(structuredContentOf(msg)?.flowResponse).toEqual({ flowToken: "cita-1", data: { fecha: "2026-11-20", sucursal: "centro" } });
  });

  it("nunca lanza: un JSON roto o ausente queda vacío (con raw si lo había)", () => {
    expect(parseFlowResponse(undefined)).toEqual({ flowToken: null, data: {} });
    expect(parseFlowResponse("{roto")).toEqual({ flowToken: null, data: {}, raw: "{roto" });
    expect(parseFlowResponse("[1,2]")).toEqual({ flowToken: null, data: {}, raw: "[1,2]" });
  });
});
