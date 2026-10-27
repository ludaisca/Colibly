import { describe, expect, it } from "vitest";
import { callLogBody, formatCallTranscript, parseCallsPayload, resolveCallParty, statusAfterWebhook, terminateOutcome } from "../events";

const OFFER = "v=0\r\noffer";

describe("resolveCallParty", () => {
  it("una llamada del cliente usa el número que no es el del negocio", () => {
    expect(resolveCallParty({
      direction: "USER_INITIATED",
      from: "5215555555555",
      to: "5218111111111",
      businessNumber: "+52 81 1111 1111",
    })).toEqual({ direction: "USER_INITIATED", peer: "5215555555555" });
  });

  it("si el webhook trae from = negocio, el peer es to", () => {
    expect(resolveCallParty({
      from: "13175551399",
      to: "16315553601",
      sdpType: "offer",
      businessNumber: "13175551399",
    })).toEqual({ direction: "USER_INITIATED", peer: "16315553601" });
  });

  it("una llamada que marcamos nosotros toma al destinatario", () => {
    expect(resolveCallParty({
      direction: "BUSINESS_INITIATED",
      from: "13175551399",
      to: "12185552828",
      sdpType: "answer",
      businessNumber: "13175551399",
    })).toEqual({ direction: "BUSINESS_INITIATED", peer: "12185552828" });
  });
});

describe("terminateOutcome", () => {
  it("Failed gana aunque también venga duración", () => {
    expect(terminateOutcome(["Failed"], 12)).toBe("FAILED");
  });
  it("con duración es una llamada terminada", () => {
    expect(terminateOutcome("Completed", 48)).toBe("ENDED");
  });
  it("sin duración y sin fallo es perdida", () => {
    expect(terminateOutcome("Completed", 0)).toBe("MISSED");
  });
});

describe("statusAfterWebhook", () => {
  it("ACCEPTED pasa a ACTIVE y un final no se reabre", () => {
    expect(statusAfterWebhook("RINGING", "ACCEPTED")).toBe("ACTIVE");
    expect(statusAfterWebhook("ENDED", "RINGING")).toBe("ENDED");
    expect(statusAfterWebhook("ACTIVE", "REJECTED")).toBe("REJECTED");
  });
});

describe("parseCallsPayload", () => {
  it("guarda la oferta entrante y el nombre del contacto", () => {
    const parsed = parseCallsPayload({
      metadata: { display_phone_number: "13175551399" },
      contacts: [{ profile: { name: "Ana" }, wa_id: "16315553601" }],
      calls: [{
        id: "wacid.1",
        from: "16315553601",
        to: "13175551399",
        event: "connect",
        session: { sdp_type: "offer", sdp: OFFER },
      }],
    }, "13175551399");
    expect(parsed.calls).toHaveLength(1);
    expect(parsed.calls[0]).toMatchObject({
      metaCallId: "wacid.1",
      event: "connect",
      direction: "USER_INITIATED",
      peer: "16315553601",
      peerName: "Ana",
      sdpType: "offer",
      sdp: OFFER,
    });
  });

  it("lee el estado RINGING de una llamada saliente", () => {
    const parsed = parseCallsPayload({
      statuses: [{ id: "wacid.2", status: "ACCEPTED", type: "call" }],
    }, null);
    expect(parsed.statuses).toEqual([{ metaCallId: "wacid.2", status: "ACCEPTED" }]);
  });
});

describe("grabación y transcripción", () => {
  it("separa el audio y el texto de los eventos de la llamada", () => {
    const parsed = parseCallsPayload({
      calls: [
        {
          id: "wacid.1",
          event: "call_recording_available",
          call_recording: { type: "audio", audio: { id: "m1", mime_type: "audio/ogg" } },
        },
        {
          id: "wacid.1",
          event: "call_transcription_available",
          call_transcript: { document: { id: "m2", mime_type: "application/json" } },
        },
      ],
    }, null);
    expect(parsed.calls).toEqual([]);
    expect(parsed.artifacts).toEqual([
      { metaCallId: "wacid.1", kind: "recording", mediaId: "m1", mimeType: "audio/ogg" },
      { metaCallId: "wacid.1", kind: "transcript", mediaId: "m2", mimeType: "application/json" },
    ]);
  });

  it("lee el texto anidado que manda Meta", () => {
    expect(formatCallTranscript({
      metadata: { processed_at: "2026-10-27T20:27:09Z" },
      transcript: { text: "[Customer] Hola", segments: [{ speaker: "Customer", text: "Hola" }] },
    })).toBe("Cliente: Hola");
  });

  it("arma el texto con quién habló", () => {
    expect(formatCallTranscript({
      segments: [
        { speaker: "Business", text: "Hola." },
        { speaker: "Customer", text: "Quiero una cita." },
      ],
    })).toBe("Nosotros: Hola.\nCliente: Quiero una cita.");
  });
});

describe("callLogBody", () => {
  it("describe perdida, rechazo y duración", () => {
    expect(callLogBody("USER_INITIATED", "MISSED", 0)).toBe("Llamada perdida");
    expect(callLogBody("BUSINESS_INITIATED", "REJECTED", 0)).toBe("Rechazaron la llamada");
    expect(callLogBody("USER_INITIATED", "ENDED", 65)).toBe("Llamada · 1 min 5 s");
  });
});
