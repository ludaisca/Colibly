import { describe, expect, it } from "vitest";
import { parseWhatsAppFormat as parse, hasWhatsAppFormat, toggleFormat } from "../format";

describe("parseWhatsAppFormat", () => {
  it("texto plano queda igual", () => {
    expect(parse("hola mundo")).toEqual(["hola mundo"]);
  });

  it("negrita, cursiva y tachado", () => {
    expect(parse("es *muy* _bueno_ ~caro~")).toEqual([
      "es ",
      { kind: "bold", children: ["muy"] },
      " ",
      { kind: "italic", children: ["bueno"] },
      " ",
      { kind: "strike", children: ["caro"] },
    ]);
  });

  it("anidado", () => {
    expect(parse("*hola _tú_*")).toEqual([{ kind: "bold", children: ["hola ", { kind: "italic", children: ["tú"] }] }]);
  });

  it("no formatea dentro de palabras ni con espacios en los bordes", () => {
    expect(parse("snake_case_name")).toEqual(["snake_case_name"]);
    expect(parse("2*3*4")).toEqual(["2*3*4"]);
    expect(parse("* hola*")).toEqual(["* hola*"]);
    expect(parse("*hola *")).toEqual(["*hola *"]);
  });

  it("acepta puntuación alrededor", () => {
    expect(parse("(*ok*).")).toEqual(["(", { kind: "bold", children: ["ok"] }, ")."]);
  });

  it("el formato en línea no cruza saltos de línea", () => {
    expect(parse("*hola\nmundo*")).toEqual(["*hola\nmundo*"]);
  });

  it("monoespaciado en bloque, sin formato dentro", () => {
    expect(parse("ver ```a *b*\nc``` fin")).toEqual(["ver ", { kind: "mono", children: ["a *b*\nc"] }, " fin"]);
  });

  it("código en línea no se anida", () => {
    expect(parse("usa `*x*`")).toEqual(["usa ", { kind: "code", children: ["*x*"] }]);
  });

  it("marcador sin cierre", () => {
    expect(parse("precio *especial")).toEqual(["precio *especial"]);
    expect(hasWhatsAppFormat("precio *especial")).toBe(false);
    expect(hasWhatsAppFormat("*sí*")).toBe(true);
  });
});

describe("toggleFormat", () => {
  it("envuelve la selección", () => {
    expect(toggleFormat("hola mundo", 5, 10, "bold")).toEqual({ text: "hola *mundo*", start: 6, end: 11 });
  });

  it("deja fuera los espacios de los bordes", () => {
    expect(toggleFormat("hola mundo ", 4, 11, "italic")).toEqual({ text: "hola _mundo_ ", start: 6, end: 11 });
  });

  it("alterna: quita el marcador si ya está", () => {
    expect(toggleFormat("hola *mundo*", 6, 11, "bold")).toEqual({ text: "hola mundo", start: 5, end: 10 });
    expect(toggleFormat("hola *mundo*", 5, 12, "bold")).toEqual({ text: "hola mundo", start: 5, end: 10 });
  });

  it("sin selección inserta el par con el cursor en medio", () => {
    expect(toggleFormat("ab", 1, 1, "strike")).toEqual({ text: "a~~b", start: 2, end: 2 });
  });

  it("monoespaciado usa triple acento grave", () => {
    expect(toggleFormat("x", 0, 1, "mono")).toEqual({ text: "```x```", start: 3, end: 4 });
  });
});
