import { describe, expect, it } from "vitest";
import {
  normalizeHistoryMedia,
  digitsOnly,
  historyIsComplete,
  jidCandidates,
  mapHistoryStatus,
  normalizeEchoes,
  normalizeHistory,
  normalizeStateSync,
} from "../normalize";

describe("jidCandidates", () => {
  it("solo dígitos y vacío", () => {
    expect(digitsOnly("+52 55 6862 3317")).toBe("525568623317");
    expect(jidCandidates("")).toEqual([]);
  });
  it("número no mexicano: una sola forma", () => expect(jidCandidates("16505551234")).toEqual(["16505551234"]));
  it("México con 521 prueba también 52", () => expect(jidCandidates("5215568623317")).toEqual(["5215568623317", "525568623317"]));
  it("México con 52 prueba también 521", () => expect(jidCandidates("525568623317")).toEqual(["525568623317", "5215568623317"]));
  it("no inventa variantes para otros prefijos 52…", () => expect(jidCandidates("52123")).toEqual(["52123"]));
});

describe("normalizeEchoes", () => {
  const value = {
    messaging_product: "whatsapp",
    metadata: { display_phone_number: "15550783881", phone_number_id: "106540352242922" },
    message_echoes: [
      {
        from: "15550783881",
        to: "16505551234",
        id: "wamid.AAA",
        timestamp: "1739321024",
        type: "text",
        text: { body: "Aquí está la info" },
      },
      { from: "15550783881", to: "16505559999", id: "wamid.BBB", timestamp: "1739321030", type: "image", image: { id: "m1", mime_type: "image/jpeg", caption: "foto" } },
      { from: "15550783881", id: "wamid.SIN_DESTINO", timestamp: "1", type: "text", text: { body: "x" } },
    ],
  };

  it("los ecos son salientes y el cliente es `to`", () => {
    const [text, image] = normalizeEchoes(value);
    expect(text).toMatchObject({ wamid: "wamid.AAA", userPhone: "16505551234", direction: "OUTBOUND", type: "text", body: "Aquí está la info", mediaId: null });
    expect(text.timestamp.toISOString()).toBe("2025-02-12T00:43:44.000Z");
    expect(image).toMatchObject({ type: "image", mediaId: "m1", mimeType: "image/jpeg", caption: "foto", body: "foto" });
  });
  it("descarta ecos sin destinatario o sin id", () => expect(normalizeEchoes(value)).toHaveLength(2));
  it("un eco con botones guarda el texto y los títulos", () => {
    const [msg] = normalizeEchoes({
      message_echoes: [{
        from: "15550783881",
        to: "16505551234",
        id: "wamid.BTN",
        timestamp: "1739321024",
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: "¿Seguimos con la cotización?" },
          action: {
            buttons: [
              { type: "reply", reply: { id: "si", title: "Sí" } },
              { type: "reply", reply: { id: "no", title: "Ahora no" } },
            ],
          },
        },
      }],
    });
    expect(msg.body).toBe("¿Seguimos con la cotización?");
    expect(msg.interactivePayload).toEqual({
      buttons: [
        { id: "si", title: "Sí" },
        { id: "no", title: "Ahora no" },
      ],
    });
  });
  it("forma inesperada → vacío", () => {
    expect(normalizeEchoes(null)).toEqual([]);
    expect(normalizeEchoes({ message_echoes: "x" })).toEqual([]);
  });
});

describe("normalizeHistory", () => {
  const value = {
    metadata: { display_phone_number: "+1 555 078 3881", phone_number_id: "1" },
    history: [
      {
        metadata: { phase: 0, chunk_order: 1, progress: 55 },
        threads: [
          {
            id: "16505551234",
            messages: [
              { from: "16505551234", id: "wamid.IN", timestamp: "1738796000", type: "text", text: { body: "Hola" }, history_context: { status: "READ" } },
              { from: "15550783881", to: "16505551234", id: "wamid.OUT", timestamp: "1738796100", type: "text", text: { body: "¿En qué te ayudo?" }, history_context: { status: "DELIVERED" } },
              { from: "15550783881", to: "16505551234", id: "wamid.MEDIA", timestamp: "1738796200", type: "media_placeholder", history_context: { status: "SENT" } },
            ],
          },
          { id: "", messages: [{ from: "x", id: "wamid.X", timestamp: "1", type: "text", text: { body: "ignorado" } }] },
        ],
      },
    ],
  };

  it("distingue entrante y saliente comparando con el número del negocio", () => {
    const [env] = normalizeHistory(value);
    expect(env.kind).toBe("chunk");
    if (env.kind !== "chunk") return;
    expect(env).toMatchObject({ phase: 0, chunkOrder: 1, progress: 55 });
    expect(env.messages.map((m) => [m.wamid, m.direction, m.userPhone])).toEqual([
      ["wamid.IN", "INBOUND", "16505551234"],
      ["wamid.OUT", "OUTBOUND", "16505551234"],
      ["wamid.MEDIA", "OUTBOUND", "16505551234"],
    ]);
    expect(env.messages[0].historyStatus).toBe("READ");
    expect(env.messages[2].type).toBe("media_placeholder");
  });

  it("historial rechazado por el negocio (error 2593109)", () => {
    const declined = { history: [{ errors: [{ code: 2593109, title: "History sync is turned off", message: "off" }] }] };
    expect(normalizeHistory(declined)).toEqual([{ kind: "declined" }]);
  });

  it("otro error se reporta con su código", () => {
    const err = { history: [{ errors: [{ code: 131000, message: "algo falló" }] }] };
    expect(normalizeHistory(err)).toEqual([{ kind: "error", code: 131000, message: "algo falló" }]);
  });

  it("sin número del negocio no se adivina la dirección: todo entrante", () => {
    const v = { history: [{ metadata: {}, threads: [{ id: "16505551234", messages: [{ from: "15550783881", id: "w", timestamp: "1", type: "text", text: { body: "a" } }] }] }] };
    const [env] = normalizeHistory(v);
    if (env.kind !== "chunk") throw new Error("esperaba chunk");
    expect(env.messages[0].direction).toBe("INBOUND");
  });

  it("forma inesperada → vacío", () => expect(normalizeHistory({})).toEqual([]));
});

describe("normalizeStateSync", () => {
  it("altas y bajas de contactos", () => {
    const value = {
      state_sync: [
        { type: "contact", contact: { full_name: "Pablo Morales", first_name: "Pablo", phone_number: "16505551234" }, action: "add", metadata: { timestamp: "1738346006" } },
        { type: "contact", contact: { phone_number: "+1 650 555 9999" }, action: "remove", metadata: { timestamp: "1738346007" } },
        { type: "otra_cosa", contact: { phone_number: "1" }, action: "add" },
        { type: "contact", contact: {}, action: "add" },
      ],
    };
    const out = normalizeStateSync(value);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ phone: "16505551234", fullName: "Pablo Morales", firstName: "Pablo", action: "add" });
    expect(out[1]).toMatchObject({ phone: "16505559999", fullName: null, action: "remove" });
  });
});

describe("progreso del historial", () => {
  it("100 o más = completo", () => {
    expect(historyIsComplete(100)).toBe(true);
    expect(historyIsComplete(99)).toBe(false);
    expect(historyIsComplete(null)).toBe(false);
  });
  it("estados de entrega", () => {
    expect(mapHistoryStatus("READ")).toBe("read");
    expect(mapHistoryStatus("PLAYED")).toBe("read");
    expect(mapHistoryStatus("DELIVERED")).toBe("delivered");
    expect(mapHistoryStatus("SENT")).toBe("sent");
    expect(mapHistoryStatus("ERROR")).toBe("failed");
    expect(mapHistoryStatus("PENDING")).toBeNull();
    expect(mapHistoryStatus(null)).toBeNull();
  });
});

describe("normalizeHistoryMedia", () => {
  // Forma del webhook de Meta con el medio de un placeholder del historial:
  // `value.messages[]` directo, sin `history[].threads[]`.
  const value = {
    messaging_product: "whatsapp",
    metadata: { display_phone_number: "15550783881", phone_number_id: "1" },
    messages: [
      { from: "16505551234", id: "wamid.MEDIA", timestamp: "1738796200", type: "image", image: { caption: "foto", mime_type: "image/jpeg", sha256: "x", id: "MEDIA_ID" } },
      { from: "16505551234", id: "wamid.SIGUE", timestamp: "1738796300", type: "media_placeholder" },
    ],
  };

  it("lee el medio con su id y se salta un placeholder repetido", () => {
    expect(normalizeHistoryMedia(value)).toEqual([
      { wamid: "wamid.MEDIA", type: "image", body: expect.any(String), mediaId: "MEDIA_ID", mimeType: "image/jpeg", filename: null, caption: "foto" },
    ]);
  });

  it("el lote normal del historial no produce medios (y al revés)", () => {
    const batch = { metadata: {}, history: [{ metadata: {}, threads: [{ id: "1", messages: [{ from: "1", id: "w", timestamp: "1", type: "image", image: { id: "M" } }] }] }] };
    expect(normalizeHistoryMedia(batch)).toEqual([]);
    expect(normalizeHistory(value)).toEqual([]);
  });
});
