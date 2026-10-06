import { describe, expect, it } from "vitest";
import { normalizeEmail, normalizePersonPhone, phoneKey, phoneForms, cleanText } from "@/lib/crm/normalize";
import { findDuplicateClusters, matchesByKeys, type DupPerson } from "@/lib/crm/duplicates";
import { mergePersonFields, diffFields, type MergeablePerson } from "@/lib/crm/merge-fields";
import { parseCsv, suggestMapping, buildImportPreview, importFingerprint, companyNamesToResolve, ImportInputError } from "@/lib/crm/import-csv";

const d = (n: number) => new Date(2026, 0, n);
const P = (id: string, over: Partial<DupPerson> = {}): DupPerson => ({ id, name: id, email: null, phoneDigits: null, createdAt: d(1), ...over });

describe("normalize", () => {
  it("correo: minúsculas, inválido distinguido de ausente", () => {
    expect(normalizeEmail("  Ana@Empresa.COM ")).toEqual({ email: "ana@empresa.com", invalid: false });
    expect(normalizeEmail("")).toEqual({ email: null, invalid: false });
    expect(normalizeEmail("ana@")).toEqual({ email: null, invalid: true });
  });
  it("teléfono: conserva el texto, guarda dígitos, valida longitud", () => {
    expect(normalizePersonPhone("+52 (55) 1234-5678")).toEqual({ phone: "+52 (55) 1234-5678", phoneDigits: "525512345678", invalid: false });
    expect(normalizePersonPhone("123").invalid).toBe(true);
    expect(normalizePersonPhone(null)).toEqual({ phone: null, phoneDigits: null, invalid: false });
  });
  it("52… y 521… tienen la misma llave y las dos formas", () => {
    expect(phoneKey("5215512345678")).toBe(phoneKey("525512345678"));
    expect(phoneKey("14155550123")).not.toBe(phoneKey("14155550124"));
    expect(phoneForms("525512345678").sort()).toEqual(["525512345678", "5215512345678"].sort());
    expect(phoneKey("123")).toBeNull();
  });
  it("cleanText colapsa espacios y recorta", () => {
    expect(cleanText("  Ana   María ")).toBe("Ana María");
    expect(cleanText("   ")).toBeNull();
    expect(cleanText(5)).toBeNull();
  });
});

describe("duplicados", () => {
  it("agrupa por correo y por teléfono (52/521) y encadena", () => {
    const people = [
      P("a", { email: "x@y.com", createdAt: d(2) }),
      P("b", { email: "X@y.com", phoneDigits: "5215512345678", createdAt: d(1) }),
      P("c", { phoneDigits: "525512345678", createdAt: d(3) }),
      P("solo", { email: "otro@y.com" }),
    ];
    const clusters = findDuplicateClusters(people);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].ids).toEqual(["b", "a", "c"]); // más antiguo primero
    expect(clusters[0].reasons).toEqual(["email", "phone"]);
  });
  it("sin coincidencias no hay grupos", () => {
    expect(findDuplicateClusters([P("a", { email: "a@a.com" }), P("b", { email: "b@b.com" })])).toEqual([]);
  });
  it("matchesByKeys avisa del choque antes de crear", () => {
    const m = matchesByKeys({ email: "a@a.com", phoneDigits: null }, [P("e", { email: "A@a.com" }), P("f", { email: "z@z.com" })]);
    expect(m).toEqual([{ id: "e", reasons: ["email"] }]);
  });
});

describe("fusión", () => {
  const base: MergeablePerson = { name: "Ana", email: null, phone: null, phoneDigits: null, jobTitle: null, companyId: null, ownerId: null, lifecycle: "LEAD", source: null };
  it("solo completa vacíos, nunca pisa", () => {
    const r = mergePersonFields(
      { ...base, email: "t@t.com", ownerId: "u1" },
      { ...base, name: "Otra", email: "s@s.com", phone: "55 1", phoneDigits: "5511111111", jobTitle: "Gerente", ownerId: "u2" }
    );
    expect(r.data).toEqual({ phone: "55 1", phoneDigits: "5511111111", jobTitle: "Gerente" });
    expect(r.filled).toContain("jobTitle");
  });
  it("si alguna es cliente, la fusionada es cliente", () => {
    expect(mergePersonFields(base, { ...base, lifecycle: "CUSTOMER" }).data.lifecycle).toBe("CUSTOMER");
    expect(mergePersonFields({ ...base, lifecycle: "CUSTOMER" }, base).data.lifecycle).toBeUndefined();
  });
  it("diffFields solo reporta lo que cambió", () => {
    expect(diffFields({ name: "A", email: null as string | null }, { name: "B", email: null }, ["name", "email"])).toEqual({ name: ["A", "B"] });
  });
});

describe("CSV", () => {
  it("campos con comillas, comas y saltos de línea dentro", () => {
    const rows = parseCsv('nombre,nota\n"Pérez, Ana","línea 1\nlínea 2"\n"Dijo ""hola""",x');
    expect(rows).toEqual([["nombre", "nota"], ["Pérez, Ana", "línea 1\nlínea 2"], ['Dijo "hola"', "x"]]);
  });
  it("detecta ; (Excel en español), BOM y CRLF", () => {
    expect(parseCsv("﻿nombre;correo\r\nAna;a@a.com\r\n")).toEqual([["nombre", "correo"], ["Ana", "a@a.com"]]);
  });
  it("sugiere el mapeo por encabezado, con acentos", () => {
    expect(suggestMapping(["Nombre completo", "Correo electrónico", "Teléfono", "Empresa", "Cargo"]))
      .toEqual({ name: "Nombre completo", email: "Correo electrónico", phone: "Teléfono", company: "Empresa", jobTitle: "Cargo" });
  });
  const csv = "nombre,correo,telefono,empresa\nAna,ana@a.com,5215512345678,Acme\nBeto,,525512345678,acme\nCarla,carla@c.com,,\n,x@x.com,,\nDora,mal,,\nEva,ana@a.com,,\nFer,,12,\n";
  it("clasifica ready / duplicate / error", () => {
    const pv = buildImportPreview(csv, undefined, [{ id: "p9", email: null, phoneDigits: "5215512345678" }]);
    const byName = Object.fromEntries(pv.rows.map((r) => [r.name ?? "(sin nombre)", r]));
    expect(byName.Ana.status).toBe("duplicate"); // el teléfono ya existe (521…)
    expect(byName.Ana.existingPersonId).toBe("p9");
    expect(byName.Beto.status).toBe("duplicate"); // 52… = mismo móvil que el existente
    expect(byName.Carla.status).toBe("ready");
    expect(byName["(sin nombre)"].reason).toBe("Falta el nombre");
    expect(byName.Dora.reason).toBe("Correo inválido");
    expect(byName.Fer.reason).toContain("Teléfono inválido");
    expect(pv.counts).toEqual({ total: 7, ready: 2, duplicate: 2, error: 3 });
  });
  it("repetidos dentro del archivo", () => {
    const pv = buildImportPreview("nombre,correo\nAna,a@a.com\nAna 2,A@a.com\n", undefined, []);
    expect(pv.rows.map((r) => r.status)).toEqual(["ready", "duplicate"]);
    expect(pv.rows[1].reason).toBe("Repetido en el archivo");
  });
  it("huella estable e independiente del orden del mapeo; cambia con el archivo", () => {
    const a = importFingerprint("x", { name: "n", email: "e" });
    expect(a).toBe(importFingerprint("x", { email: "e", name: "n" }));
    expect(a).not.toBe(importFingerprint("y", { name: "n", email: "e" }));
  });
  it("valida entradas", () => {
    expect(() => buildImportPreview("", undefined, [])).toThrow(ImportInputError);
    expect(() => buildImportPreview("a,b\n", undefined, [])).toThrow(/al menos una fila/);
    expect(() => buildImportPreview("x,y\n1,2\n", undefined, [])).toThrow(/nombre/);
    expect(() => buildImportPreview("nombre\nA\n", { name: "nope" }, [])).toThrow(/no existe/);
    const big = "nombre\n" + Array.from({ length: 1001 }, (_, i) => `n${i}`).join("\n");
    expect(() => buildImportPreview(big, undefined, [])).toThrow(/1000/);
  });
  it("nombres de empresa únicos sin importar mayúsculas", () => {
    const pv = buildImportPreview("nombre,empresa\nA,Acme\nB,ACME\nC,Zeta\n", undefined, []);
    expect(companyNamesToResolve(pv.rows)).toEqual(["Acme", "Zeta"]);
  });
});
