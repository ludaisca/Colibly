import { createHash } from "node:crypto";
import { cleanText, normalizeEmail, normalizePersonPhone, phoneKey, emailKey, companyNameKey } from "@/lib/crm/normalize";

// Importación CSV de contactos — parte PURA (lectura, mapeo, validación,
// duplicados y huella). Lo que toca la base está en lib/crm/import.ts.

export const IMPORT_MAX_ROWS = 1000;
export const IMPORT_MAX_CHARS = 500_000;

// Lector RFC 4180: comillas, comillas escapadas (""), saltos de línea dentro de
// un campo, BOM, y delimitador `,` `;` o tabulador detectado en el encabezado
// (Excel en español exporta con `;`).
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = ([",", ";", "\t"] as const)
    .map((d) => ({ d, n: firstLine.split(d).length - 1 }))
    .sort((a, b) => b.n - a.n)[0];
  const sep = delimiter.n > 0 ? delimiter.d : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === "") {
      quoted = true;
    } else if (ch === sep) {
      row.push(field); field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      rows.push(row); row = [];
    } else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export type ImportField = "name" | "email" | "phone" | "company" | "jobTitle";
export type ImportMapping = Partial<Record<ImportField, string>>;

const SYNONYMS: Record<ImportField, string[]> = {
  name: ["nombre", "name", "nombre completo", "full name", "contacto", "cliente"],
  email: ["correo", "correo electronico", "correo electrónico", "email", "e-mail", "mail"],
  phone: ["telefono", "teléfono", "phone", "celular", "movil", "móvil", "whatsapp", "numero", "número", "tel"],
  company: ["empresa", "company", "compania", "compañía", "organizacion", "organización"],
  jobTitle: ["cargo", "puesto", "job title", "title", "rol"],
};

const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

// Propone qué columna del archivo es cada campo, por nombre de encabezado.
export function suggestMapping(headers: readonly string[]): ImportMapping {
  const mapping: ImportMapping = {};
  for (const field of Object.keys(SYNONYMS) as ImportField[]) {
    const wanted = SYNONYMS[field].map(norm);
    const hit = headers.find((h) => wanted.includes(norm(h)));
    if (hit) mapping[field] = hit;
  }
  return mapping;
}

export type RowStatus = "ready" | "duplicate" | "error";
export interface PreviewRow {
  row: number; // número de fila en el archivo (el encabezado es la 1)
  status: RowStatus;
  name: string | null;
  email: string | null;
  phone: string | null;
  phoneDigits: string | null;
  company: string | null;
  jobTitle: string | null;
  // error: motivo; duplicate: "en el archivo" o id de la persona existente
  reason?: string;
  existingPersonId?: string;
}

export interface ExistingKeyPerson {
  id: string;
  email: string | null;
  phoneDigits: string | null;
}

export interface ImportPreview {
  headers: string[];
  mapping: ImportMapping;
  rows: PreviewRow[];
  counts: { total: number; ready: number; duplicate: number; error: number };
  fingerprint: string;
}

export function importFingerprint(csv: string, mapping: ImportMapping): string {
  const stable = JSON.stringify(Object.entries(mapping).sort(([a], [b]) => a.localeCompare(b)));
  return createHash("sha256").update(csv).update("\u0000").update(stable).digest("hex");
}

export class ImportInputError extends Error {}

export function buildImportPreview(csv: string, mappingIn: ImportMapping | undefined, existing: readonly ExistingKeyPerson[]): ImportPreview {
  if (typeof csv !== "string" || !csv.trim()) throw new ImportInputError("El archivo está vacío.");
  if (csv.length > IMPORT_MAX_CHARS) throw new ImportInputError("El archivo es demasiado grande (máximo 500 000 caracteres).");
  const table = parseCsv(csv);
  if (table.length < 2) throw new ImportInputError("El archivo necesita un encabezado y al menos una fila.");
  if (table.length - 1 > IMPORT_MAX_ROWS) throw new ImportInputError(`Importa hasta ${IMPORT_MAX_ROWS} filas por vez.`);

  const headers = table[0].map((h) => h.trim());
  const mapping = mappingIn && Object.keys(mappingIn).length ? mappingIn : suggestMapping(headers);
  for (const [field, col] of Object.entries(mapping)) {
    if (col && !headers.includes(col)) throw new ImportInputError(`La columna "${col}" (${field}) no existe en el archivo.`);
  }
  if (!mapping.name) throw new ImportInputError("Indica qué columna es el nombre.");

  const idx = (field: ImportField) => (mapping[field] ? headers.indexOf(mapping[field]!) : -1);
  const get = (r: string[], field: ImportField) => (idx(field) === -1 ? "" : r[idx(field)] ?? "");

  const existingByEmail = new Map<string, string>();
  const existingByPhone = new Map<string, string>();
  for (const p of existing) {
    const e = emailKey(p.email);
    if (e && !existingByEmail.has(e)) existingByEmail.set(e, p.id);
    const ph = phoneKey(p.phoneDigits);
    if (ph && !existingByPhone.has(ph)) existingByPhone.set(ph, p.id);
  }

  const seenEmail = new Set<string>();
  const seenPhone = new Set<string>();
  const rows: PreviewRow[] = table.slice(1).map((r, i) => {
    const name = cleanText(get(r, "name"));
    const { email, invalid: badEmail } = normalizeEmail(get(r, "email"));
    const { phone, phoneDigits, invalid: badPhone } = normalizePersonPhone(get(r, "phone"));
    const base = { row: i + 2, name, email, phone, phoneDigits, company: cleanText(get(r, "company")), jobTitle: cleanText(get(r, "jobTitle")) };

    if (!name) return { ...base, status: "error", reason: "Falta el nombre" };
    if (badEmail) return { ...base, status: "error", reason: "Correo inválido" };
    if (badPhone) return { ...base, status: "error", reason: "Teléfono inválido (usa 7 a 15 dígitos)" };

    const ek = emailKey(email), pk = phoneKey(phoneDigits);
    const existingId = (ek && existingByEmail.get(ek)) || (pk && existingByPhone.get(pk)) || undefined;
    if (existingId) return { ...base, status: "duplicate", reason: "Ya existe en tus contactos", existingPersonId: existingId };
    if ((ek && seenEmail.has(ek)) || (pk && seenPhone.has(pk))) return { ...base, status: "duplicate", reason: "Repetido en el archivo" };
    if (ek) seenEmail.add(ek);
    if (pk) seenPhone.add(pk);
    return { ...base, status: "ready" };
  });

  const counts = { total: rows.length, ready: 0, duplicate: 0, error: 0 };
  for (const r of rows) counts[r.status]++;
  return { headers, mapping, rows, counts, fingerprint: importFingerprint(csv, mapping) };
}

// Nombres de empresa distintos (sin repetir mayúsculas) de las filas listas.
export function companyNamesToResolve(rows: readonly PreviewRow[]): string[] {
  const seen = new Map<string, string>();
  for (const r of rows) {
    if (r.status !== "ready" || !r.company) continue;
    const k = companyNameKey(r.company)!;
    if (!seen.has(k)) seen.set(k, r.company);
  }
  return [...seen.values()];
}
