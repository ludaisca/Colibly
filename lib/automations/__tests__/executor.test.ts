import { describe, expect, it } from "vitest";
import { execute, MAX_STEPS_PER_ADVANCE } from "../executor";
import type { Step } from "../types";
import { buttons, fakeAdapters, graph, SendFailure, startState, text } from "./helpers";

describe("execute — pasos lineales", () => {
  it("envía en orden, renderiza variables y termina", async () => {
    const g = graph([text("a", "Hola {{nombre}} 👋"), { id: "t", type: "add_tag", config: { tagName: "Bienvenida" } }, text("b", "Tel {{telefono}} {{desconocido}}.")]);
    const { adapters, sent, calls } = fakeAdapters();
    const r = await execute(g, startState(g), { kind: "start" }, adapters);
    expect(r.outcome.status).toBe("completed");
    expect(sent()).toEqual([
      { type: "text", text: "Hola Ana 👋" },
      { type: "text", text: "Tel 5215500000001." },
    ]);
    expect(calls.map((c) => c.op)).toEqual(["send", "addTag", "send"]);
    expect(r.state.nodeId).toBeNull();
  });

  it("una espera detiene la ejecución y el resume continúa desde el paso siguiente", async () => {
    const g = graph([text("a", "uno"), { id: "w", type: "wait", config: { minutes: 90 } }, text("b", "dos")]);
    const f = fakeAdapters();
    const r1 = await execute(g, startState(g), { kind: "start" }, f.adapters);
    expect(r1.outcome).toEqual({ status: "waiting_delay", until: new Date("2026-09-25T16:30:00Z") });
    expect(r1.state.nodeId).toBe("b");
    const r2 = await execute(g, r1.state, { kind: "resume" }, f.adapters);
    expect(r2.outcome.status).toBe("completed");
    expect(f.sent().map((m) => (m as { text: string }).text)).toEqual(["uno", "dos"]);
  });

  it("una espera al final no deja la ejecución colgada", async () => {
    const g = graph([text("a", "uno"), { id: "w", type: "wait", config: { minutes: 60 } }]);
    const r = await execute(g, startState(g), { kind: "start" }, fakeAdapters().adapters);
    expect(r.outcome.status).toBe("completed");
  });

  it("una cadena larga sin esperas se parte en varios avances (no falla)", async () => {
    const steps: Step[] = Array.from({ length: MAX_STEPS_PER_ADVANCE + 5 }, (_, i) => ({ id: `s${i}`, type: "add_tag", config: { tagName: `t${i}` } }));
    const g = graph(steps);
    const f = fakeAdapters();
    const r1 = await execute(g, startState(g), { kind: "start" }, f.adapters);
    expect(r1.outcome.status).toBe("waiting_delay");
    const r2 = await execute(g, r1.state, { kind: "resume" }, f.adapters);
    expect(r2.outcome.status).toBe("completed");
    expect(f.calls.filter((c) => c.op === "addTag")).toHaveLength(MAX_STEPS_PER_ADVANCE + 5);
  });
});

describe("execute — botones", () => {
  const g = graph([
    buttons("q", ["Facial", "Masaje"], {
      Facial: [text("f", "El facial cuesta $850")],
      Masaje: [text("m", "El masaje cuesta $950")],
      other: [text("o", "Te comunico con alguien")],
      timeout: [text("t", "¿Sigues ahí?")],
    }),
  ]);

  async function waitingOnButtons(overrides: Parameters<typeof fakeAdapters>[0] = {}) {
    const f = fakeAdapters(overrides);
    const r = await execute(g, startState(g), { kind: "start" }, f.adapters);
    expect(r.outcome.status).toBe("waiting_reply");
    expect(r.state.waiting).toEqual({ nodeId: "q", kind: "options", reprompts: 0 });
    return { f, state: r.state };
  }

  it("empareja por id del botón tocado", async () => {
    const { f, state } = await waitingOnButtons();
    const r = await execute(g, state, { kind: "reply", text: "Masaje", replyId: "q_o2" }, f.adapters);
    expect(r.outcome.status).toBe("completed");
    expect(f.sent().at(-1)).toEqual({ type: "text", text: "El masaje cuesta $950" });
    expect(r.state.vars.opcion).toBe("Masaje");
  });

  it("empareja por texto escrito sin acentos ni mayúsculas, y por número", async () => {
    const a = await waitingOnButtons();
    const r1 = await execute(g, a.state, { kind: "reply", text: "  FACIAL!! ", replyId: null }, a.f.adapters);
    expect(a.f.sent().at(-1)).toEqual({ type: "text", text: "El facial cuesta $850" });
    expect(r1.outcome.status).toBe("completed");

    const b = await waitingOnButtons();
    await execute(g, b.state, { kind: "reply", text: "2", replyId: null }, b.f.adapters);
    expect(b.f.sent().at(-1)).toEqual({ type: "text", text: "El masaje cuesta $950" });
  });

  it("respuesta no reconocida: repite las opciones 2 veces y luego toma “otra respuesta”", async () => {
    const { f, state } = await waitingOnButtons();
    const r1 = await execute(g, state, { kind: "reply", text: "cuánto cuesta?", replyId: null }, f.adapters);
    expect(r1.outcome.status).toBe("waiting_reply");
    expect(r1.state.waiting?.reprompts).toBe(1);
    expect((f.sent().at(-1) as { text: string }).text).toContain("1. Facial\n2. Masaje");
    const r2 = await execute(g, r1.state, { kind: "reply", text: "???", replyId: null }, f.adapters);
    expect(r2.state.waiting?.reprompts).toBe(2);
    const r3 = await execute(g, r2.state, { kind: "reply", text: "no sé", replyId: null }, f.adapters);
    expect(r3.outcome.status).toBe("completed");
    expect(f.sent().at(-1)).toEqual({ type: "text", text: "Te comunico con alguien" });
  });

  it("con aiMatch la IA elige la opción cuando el texto no coincide", async () => {
    const g2 = graph([buttons("q", ["Facial", "Masaje"], { Masaje: [text("m", "masaje!")] }, { aiMatch: true })]);
    const f = fakeAdapters();
    const r = await execute(g2, startState(g2), { kind: "start" }, f.adapters);
    f.control.matchOption = "q_o2";
    await execute(g2, r.state, { kind: "reply", text: "algo para relajarme la espalda", replyId: null }, f.adapters);
    expect(f.sent().at(-1)).toEqual({ type: "text", text: "masaje!" });
  });

  it("fallback handoff pasa la conversación a un humano", async () => {
    const g2 = graph([buttons("q", ["Sí", "No"], {}, { fallback: "handoff" })]);
    const f = fakeAdapters();
    const r = await execute(g2, startState(g2), { kind: "start" }, f.adapters);
    const r2 = await execute(g2, r.state, { kind: "reply", text: "tal vez", replyId: null }, f.adapters);
    expect(r2.outcome.status).toBe("handed_off");
    expect(f.calls.some((c) => c.op === "handoff")).toBe(true);
  });

  it("timeout toma la rama sin respuesta", async () => {
    const { f, state } = await waitingOnButtons();
    const r = await execute(g, state, { kind: "timeout" }, f.adapters);
    expect(r.outcome.status).toBe("completed");
    expect(f.sent().at(-1)).toEqual({ type: "text", text: "¿Sigues ahí?" });
  });

  it("una rama vacía termina la ejecución", async () => {
    const g2 = graph([buttons("q", ["Sí", "No"])]);
    const f = fakeAdapters();
    const r = await execute(g2, startState(g2), { kind: "start" }, f.adapters);
    const r2 = await execute(g2, r.state, { kind: "reply", text: "sí", replyId: null }, f.adapters);
    expect(r2.outcome.status).toBe("completed");
  });
});

describe("execute — esperar respuesta libre", () => {
  const ask: Step = {
    id: "ask",
    type: "wait_for_reply",
    config: { timeoutMinutes: 120, validation: "email", saveToVar: "correo", saveToCustomField: "email", invalidMessage: "Ese correo no parece válido, ¿me lo repites?" },
    branches: [
      { id: "ans", key: "answered", label: "Respondió", steps: [text("ok", "Gracias, te escribimos a {{var.correo}}")] },
      { id: "to", key: "timeout", label: "Sin respuesta", steps: [text("late", "Te esperamos")] },
    ],
  };
  const g = graph([text("q", "¿Cuál es tu correo?"), ask]);

  it("valida, vuelve a pedir y guarda en variable y campo personalizado", async () => {
    const f = fakeAdapters();
    const r1 = await execute(g, startState(g), { kind: "start" }, f.adapters);
    expect(r1.outcome).toEqual({ status: "waiting_reply", until: new Date("2026-09-25T17:00:00Z") });
    const r2 = await execute(g, r1.state, { kind: "reply", text: "ana arroba mail", replyId: null }, f.adapters);
    expect(r2.outcome.status).toBe("waiting_reply");
    expect(f.sent().at(-1)).toEqual({ type: "text", text: "Ese correo no parece válido, ¿me lo repites?" });
    const r3 = await execute(g, r2.state, { kind: "reply", text: " Ana@Mail.com ", replyId: null }, f.adapters);
    expect(r3.outcome.status).toBe("completed");
    expect(r3.state.vars.correo).toBe("ana@mail.com");
    expect(f.facts.customFields.email).toBe("ana@mail.com");
    expect(f.sent().at(-1)).toEqual({ type: "text", text: "Gracias, te escribimos a ana@mail.com" });
  });

  it("tras 2 respuestas inválidas toma la rama sin respuesta", async () => {
    const f = fakeAdapters();
    let s = (await execute(g, startState(g), { kind: "start" }, f.adapters)).state;
    s = (await execute(g, s, { kind: "reply", text: "x", replyId: null }, f.adapters)).state;
    s = (await execute(g, s, { kind: "reply", text: "y", replyId: null }, f.adapters)).state;
    const r = await execute(g, s, { kind: "reply", text: "z", replyId: null }, f.adapters);
    expect(r.outcome.status).toBe("completed");
    expect(f.sent().at(-1)).toEqual({ type: "text", text: "Te esperamos" });
  });
});

describe("execute — condiciones, IA y webhook", () => {
  it("condición por etiqueta (tras agregarla en la misma ejecución) y por etapa", async () => {
    const g = graph([
      { id: "tag", type: "add_tag", config: { tagName: "VIP" } },
      {
        id: "c",
        type: "condition",
        config: { match: "all", rules: [{ subject: "tag", op: "equals", key: null, value: "vip" }, { subject: "deal_stage", op: "equals", key: null, value: "stg_new" }] },
        branches: [
          { id: "y", key: "yes", label: "Sí", steps: [text("vip", "Hola VIP")] },
          { id: "n", key: "no", label: "No", steps: [text("normal", "Hola")] },
        ],
      },
    ]);
    const f = fakeAdapters();
    await execute(g, startState(g), { kind: "start" }, f.adapters);
    expect(f.sent().at(-1)).toEqual({ type: "text", text: "Hola VIP" });
  });

  it("condición de horario laboral", async () => {
    const g = graph([
      {
        id: "c",
        type: "condition",
        config: { match: "any", rules: [{ subject: "business_hours", op: "present", key: null, value: null }] },
        branches: [
          { id: "y", key: "yes", label: "Abierto", steps: [text("a", "abierto")] },
          { id: "n", key: "no", label: "Cerrado", steps: [text("c", "cerrado")] },
        ],
      },
    ]);
    const f = fakeAdapters();
    f.control.businessHours = false;
    await execute(g, startState(g), { kind: "start" }, f.adapters);
    expect(f.sent().at(-1)).toEqual({ type: "text", text: "cerrado" });
  });

  it("clasificación IA: rama por categoría y “otro” si la IA no responde", async () => {
    const step: Step = {
      id: "ai",
      type: "ai_classify",
      config: {
        instructions: "",
        categories: [
          { id: "c1", label: "Precio", description: "" },
          { id: "c2", label: "Cita", description: "" },
        ],
      },
      branches: [
        { id: "b1", key: "c1", label: "Precio", steps: [text("p", "precios")] },
        { id: "b2", key: "c2", label: "Cita", steps: [text("ci", "citas")] },
        { id: "b3", key: "other", label: "Otro", steps: [text("o", "otro")] },
      ],
    };
    const g = graph([step]);
    const f = fakeAdapters();
    f.control.classify = "c2";
    const r = await execute(g, startState(g), { kind: "start" }, f.adapters);
    expect(f.sent().at(-1)).toEqual({ type: "text", text: "citas" });
    expect(r.state.vars.categoria).toBe("Cita");
    const f2 = fakeAdapters();
    await execute(g, startState(g), { kind: "start" }, f2.adapters);
    expect(f2.sent().at(-1)).toEqual({ type: "text", text: "otro" });
  });

  it("webhook guarda la respuesta en variables usables en mensajes", async () => {
    const g = graph([
      { id: "w", type: "webhook", config: { url: "https://erp.example/pedido", method: "POST", body: "{}", saveToVar: "erp" } },
      text("t", "Tu pedido {{var.erp.pedido}} por ${{var.erp.total}}"),
    ]);
    const f = fakeAdapters();
    await execute(g, startState(g), { kind: "start" }, f.adapters);
    expect(f.sent().at(-1)).toEqual({ type: "text", text: "Tu pedido A-17 por $950" });
  });

  it("ai_reply cede al bot y handoff pasa a humano (ambos terminan)", async () => {
    const g = graph([text("a", "Te paso con el asistente"), { id: "bot", type: "ai_reply", config: {} }]);
    const f = fakeAdapters();
    const r = await execute(g, startState(g), { kind: "start" }, f.adapters);
    expect(r.outcome.status).toBe("handed_to_bot");
    expect(f.calls.at(-1)?.op).toBe("handToBot");
  });
});

describe("execute — fallos de envío", () => {
  it("ventana cerrada con plantilla de respaldo: envía la plantilla y sigue", async () => {
    const g = graph([{ id: "a", type: "send_text", config: { text: "hola", fallbackTemplateId: "tpl1" } }, text("b", "segundo")]);
    const f = fakeAdapters();
    f.control.sendFailures.push(new SendFailure("window_closed", "fuera de ventana"));
    const r = await execute(g, startState(g), { kind: "start" }, f.adapters);
    expect(f.sent()[0]).toMatchObject({ type: "template", templateId: "tpl1" });
    expect(r.outcome.status).toBe("completed");
  });

  it("ventana cerrada sin respaldo: expira", async () => {
    const g = graph([text("a", "hola")]);
    const f = fakeAdapters();
    f.control.sendFailures.push(new SendFailure("window_closed", "fuera de ventana"));
    const r = await execute(g, startState(g), { kind: "start" }, f.adapters);
    expect(r.outcome.status).toBe("expired");
  });

  it("fallo transitorio: retry sin avanzar (se reintenta el mismo paso)", async () => {
    const g = graph([text("a", "uno"), text("b", "dos")]);
    const f = fakeAdapters();
    f.control.sendFailures.push(new SendFailure("retryable", "timeout de Meta"));
    const r = await execute(g, startState(g), { kind: "start" }, f.adapters);
    expect(r.outcome).toEqual({ status: "retry", error: "timeout de Meta" });
    expect(r.state.nodeId).toBe("a");
    const r2 = await execute(g, r.state, { kind: "resume" }, f.adapters);
    expect(r2.outcome.status).toBe("completed");
    expect(f.sent()).toHaveLength(2);
  });

  it("un paso que ya no existe en la versión falla con mensaje claro", async () => {
    const g = graph([text("a", "uno")]);
    const r = await execute(g, { nodeId: "borrado", vars: {}, waiting: null }, { kind: "resume" }, fakeAdapters().adapters);
    expect(r.outcome.status).toBe("failed");
  });
});

describe("renderText", () => {
  it("un nombre vacío no deja espacios ni comas sueltas", async () => {
    const { renderText } = await import("../graph");
    const ctx = { contact: { name: null, phone: null }, vars: {}, customFields: {} };
    expect(renderText("Hola {{nombre}}, ¿qué tal?", ctx)).toBe("Hola, ¿qué tal?");
    expect(renderText("¡Hola {{nombre}}!  Bienvenido", ctx)).toBe("¡Hola! Bienvenido");
    expect(renderText("Línea 1\n\nLínea {{var.x}}", { ...ctx, vars: { x: "2" } })).toBe("Línea 1\n\nLínea 2");
  });
});
