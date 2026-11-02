import { describe, expect, it } from "vitest";
import { buildImportPlan, guessMapping, mappingError, normalizeFieldValue, type FieldDefinition } from "../import-mapping";
import { parseCsvTable } from "@/lib/whatsapp/parse-csv";

const defs: FieldDefinition[] = [
  { id: "d-ciudad", key: "ciudad", label: "Ciudad", type: "TEXT", options: [] },
  { id: "d-presupuesto", key: "presupuesto", label: "Presupuesto", type: "NUMBER", options: [] },
  { id: "d-plan", key: "plan", label: "Plan", type: "SELECT", options: ["Básico", "Pro"] },
  { id: "d-cita", key: "cita", label: "Fecha de cita", type: "DATE", options: [] },
  { id: "d-vip", key: "vip", label: "VIP", type: "BOOLEAN", options: [] },
];

describe("guessMapping", () => {
  it("reconoce cabeceras con y sin acentos, etiquetas y campos por key o etiqueta", () => {
    expect(guessMapping(["Teléfono", "Nombre", "Etiquetas", "ciudad", "Fecha de cita", "otra"], defs)).toEqual([
      { kind: "phone" },
      { kind: "name" },
      { kind: "tag" },
      { kind: "field", definitionId: "d-ciudad" },
      { kind: "field", definitionId: "d-cita" },
      { kind: "ignore" },
    ]);
  });
  it("sin cabecera de teléfono, la primera columna es el teléfono", () => {
    expect(guessMapping(["col1", "col2"])[0]).toEqual({ kind: "phone" });
  });
});

describe("mappingError", () => {
  it("exige un solo teléfono y no repetir campos", () => {
    expect(mappingError([{ kind: "name" }])).toMatch(/teléfono/);
    expect(mappingError([{ kind: "phone" }, { kind: "phone" }])).toMatch(/Solo una/);
    expect(mappingError([{ kind: "phone" }, { kind: "field", definitionId: "a" }, { kind: "field", definitionId: "a" }])).toMatch(/dos columnas/);
    expect(mappingError([{ kind: "phone" }, { kind: "tag" }, { kind: "tag" }])).toBeNull();
  });
});

describe("normalizeFieldValue", () => {
  it("valida por tipo", () => {
    expect(normalizeFieldValue(defs[1], "$12,500")).toEqual({ value: "12500" });
    expect(normalizeFieldValue(defs[1], "mucho")).toHaveProperty("error");
    expect(normalizeFieldValue(defs[2], "pro")).toEqual({ value: "Pro" });
    expect(normalizeFieldValue(defs[2], "Oro")).toHaveProperty("error");
    expect(normalizeFieldValue(defs[3], "5/3/2026")).toEqual({ value: "2026-03-05" });
    expect(normalizeFieldValue(defs[3], "2026-13-40")).toHaveProperty("error");
    expect(normalizeFieldValue(defs[4], "Sí")).toEqual({ value: "true" });
    expect(normalizeFieldValue(defs[0], "  ")).toEqual({ value: null });
  });
});

describe("buildImportPlan", () => {
  it("aplica el mapeo, deduplica y reporta errores por fila", () => {
    const table = parseCsvTable(
      "﻿tel,nombre,etiquetas,presupuesto\n" +
        "55 1234 5678,Ana,VIP; Mayoreo,1000\n" +
        "123,Malo,,\n" +
        "5512345678,Ana repetida,,\n" +
        "5598765432,Beto,VIP,caro\n"
    );
    expect(table.headers[0]).toBe("tel");
    const mapping = guessMapping(table.headers, defs);
    mapping[3] = { kind: "field", definitionId: "d-presupuesto" };
    const plan = buildImportPlan(table, mapping, defs);
    expect(plan.rows).toEqual([
      { phone: "5512345678", name: "Ana", tags: ["VIP", "Mayoreo"], fields: { "d-presupuesto": "1000" } },
      { phone: "5598765432", name: "Beto", tags: ["VIP"], fields: {} },
    ]);
    expect(plan.duplicatesInFile).toBe(1);
    expect(plan.tagNames.sort()).toEqual(["Mayoreo", "VIP"]);
    expect(plan.issues).toEqual([
      { line: 3, message: "Teléfono inválido (123)" },
      { line: 5, message: '"Presupuesto" debe ser un número' },
    ]);
  });
});
