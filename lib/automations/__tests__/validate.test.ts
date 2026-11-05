import { describe, expect, it } from "vitest";
import { validateGraph, hasErrors } from "../validate";
import { matchOption, validateFreeReply } from "../match-reply";
import type { Step } from "../types";
import { AUTOMATION_TEMPLATES } from "../templates";
import { buttons, graph, text } from "./helpers";

const messages = (issues: { message: string }[]) => issues.map((i) => i.message);

describe("validateGraph", () => {
  it("un grafo correcto no tiene errores", () => {
    const g = graph([text("a", "Hola"), buttons("q", ["Sí", "No"])]);
    expect(hasErrors(validateGraph(g, "WHATSAPP"))).toBe(false);
  });

  it("un paso con ramas debe ser el último de su columna", () => {
    const g = graph([buttons("q", ["Sí", "No"]), text("after", "esto nunca se alcanza")]);
    expect(messages(validateGraph(g, "WHATSAPP")).join()).toContain("debe ser el último");
  });

  it("detecta ramas faltantes y límites de Meta", () => {
    const b = buttons("q", ["Una opción demasiado larga", "B", "C", "D"]);
    if (b.type === "send_buttons") b.branches = b.branches.filter((x) => x.key !== "timeout");
    const all = messages(validateGraph(graph([b]), "WHATSAPP")).join(" | ");
    expect(all).toContain("Máximo 3 opciones");
    expect(all).toContain("excede 20 caracteres");
    expect(all).toContain('Falta la rama "timeout"');
  });

  it("detecta ids repetidos", () => {
    const g = graph([text("a", "uno"), text("a", "dos")]);
    expect(messages(validateGraph(g, "WHATSAPP")).join()).toContain("Id repetido");
  });

  it("avisa cuando un mensaje libre de WhatsApp llega después de 24 h sin respuesta", () => {
    const g = graph([text("a", "hola"), { id: "w", type: "wait", config: { minutes: 25 * 60 } }, text("b", "¿sigues interesado?")]);
    const issues = validateGraph(g, "WHATSAPP");
    expect(issues.find((i) => i.nodeId === "b")?.level).toBe("warning");
    expect(issues.find((i) => i.nodeId === "a")).toBeUndefined();
    // Telegram no tiene ventana
    expect(validateGraph(g, "TELEGRAM").some((i) => i.nodeId === "b")).toBe(false);
  });

  it("la respuesta del cliente reabre la ventana en la rama respondida", () => {
    const ask: Step = {
      id: "ask",
      type: "wait_for_reply",
      config: { timeoutMinutes: 3 * 24 * 60, validation: "any", saveToVar: null, saveToCustomField: null, invalidMessage: null },
      branches: [
        { id: "ans", key: "answered", label: "", steps: [text("ok", "gracias")] },
        { id: "to", key: "timeout", label: "", steps: [text("late", "¿sigues ahí?")] },
      ],
    };
    const issues = validateGraph(graph([{ id: "w", type: "wait", config: { minutes: 2 * 24 * 60 } }, ask]), "WHATSAPP");
    expect(issues.some((i) => i.nodeId === "ok")).toBe(false);
    expect(issues.find((i) => i.nodeId === "late")?.level).toBe("warning");
  });

  it("disparador sin eventos que lo originen: avisa del primer mensaje libre en WhatsApp", () => {
    const g = graph([text("a", "hola")], { type: "tag_added", tagName: "VIP" });
    expect(validateGraph(g, "WHATSAPP").find((i) => i.nodeId === "a")?.level).toBe("warning");
  });

  it("plantillas solo en WhatsApp", () => {
    const g = graph([{ id: "t", type: "send_template", config: { templateId: "x", bodyParams: [] } }]);
    expect(hasErrors(validateGraph(g, "TELEGRAM"))).toBe(true);
  });

  it("palabra clave vacía es error", () => {
    const g = graph([text("a", "hola")], { type: "keyword", keywords: [" "], match: "exact" });
    expect(hasErrors(validateGraph(g, "WHATSAPP"))).toBe(true);
  });
});

describe("matchOption / validateFreeReply", () => {
  const options = [
    { id: "o1", title: "Facial" },
    { id: "o2", title: "Masaje relajante" },
  ];
  it.each([
    [{ text: "", replyId: "o2" }, "o2"],
    [{ text: "masaje  RELAJANTE", replyId: null }, "o2"],
    [{ text: "Fácial", replyId: null }, "o1"],
    [{ text: "1", replyId: null }, "o1"],
    [{ text: "opción 2", replyId: null }, "o2"],
    [{ text: "3", replyId: null }, null],
    [{ text: "me interesa", replyId: null }, null],
  ])("%j → %s", (reply, expected) => {
    expect(matchOption(options, reply)?.id ?? null).toBe(expected);
  });

  it.each([
    ["number", "$1,500", "1500"],
    ["number", "1500,50", "1500.5"],
    ["number", "mil", null],
    ["email", "Ana@Mail.COM", "ana@mail.com"],
    ["email", "ana@", null],
    ["phone", "+52 (55) 1234-5678", "525512345678"],
    ["phone", "123", null],
  ] as const)("%s: %s → %s", (validation, input, expected) => {
    const r = validateFreeReply(input, validation);
    expect(r.ok ? r.value : null).toBe(expected);
  });
});

describe("plantillas de la galería", () => {
  it.each(AUTOMATION_TEMPLATES.map((t) => [t.id, t]))("%s produce un grafo sin errores", (_id, template) => {
    const errors = validateGraph(template.build(), "WHATSAPP").filter((i) => i.level === "error");
    expect(errors).toEqual([]);
  });
});

describe("validateGraph — asignar a equipo", () => {
  it("exige elegir el equipo", () => {
    const issues = validateGraph(graph([{ id: "e", type: "assign_team", config: { teamId: "" } }]), "WHATSAPP");
    expect(issues.some((i) => i.message === "Elige el equipo")).toBe(true);
    expect(validateGraph(graph([{ id: "e", type: "assign_team", config: { teamId: "team_1" } }]), "WHATSAPP").some((i) => i.message === "Elige el equipo")).toBe(false);
  });
});
