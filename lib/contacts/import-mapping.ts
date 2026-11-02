// Importación de contactos con mapeo de columnas (F3). Puro: lo usan el modal
// (vista previa con errores) y la ruta (validación real), así los dos cuentan
// igual.

export type ColumnTarget =
  | { kind: "phone" }
  | { kind: "name" }
  | { kind: "tag" }
  | { kind: "field"; definitionId: string }
  | { kind: "ignore" };

export interface FieldDefinition {
  id: string;
  key: string;
  label: string;
  type: "TEXT" | "NUMBER" | "DATE" | "BOOLEAN" | "SELECT";
  options: string[];
}

export const MAX_IMPORT_ROWS = 5000;
export const MAX_IMPORT_TAGS = 50;

const PHONE_HEADERS = ["telefono", "teléfono", "phone", "numero", "número", "whatsapp", "celular", "movil", "móvil", "tel"];
const NAME_HEADERS = ["nombre", "name", "contacto", "nombre completo", "full name"];
const TAG_HEADERS = ["etiqueta", "etiquetas", "tag", "tags"];

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Propuesta inicial: teléfono/nombre/etiqueta por nombre de cabecera y campos por key o etiqueta. */
export function guessMapping(headers: string[], definitions: FieldDefinition[] = []): ColumnTarget[] {
  const strip = (list: string[]) => list.map(normalizeHeader);
  const phone = strip(PHONE_HEADERS);
  const name = strip(NAME_HEADERS);
  const tag = strip(TAG_HEADERS);
  let phoneUsed = false;
  let nameUsed = false;
  const mapping: ColumnTarget[] = headers.map((header) => {
    const h = normalizeHeader(header);
    if (!phoneUsed && phone.includes(h)) {
      phoneUsed = true;
      return { kind: "phone" };
    }
    if (!nameUsed && name.includes(h)) {
      nameUsed = true;
      return { kind: "name" };
    }
    if (tag.includes(h)) return { kind: "tag" };
    const def = definitions.find((d) => normalizeHeader(d.key) === h || normalizeHeader(d.label) === h);
    if (def) return { kind: "field", definitionId: def.id };
    return { kind: "ignore" };
  });
  // Sin cabecera reconocible, la primera columna es el teléfono (comportamiento anterior).
  if (!phoneUsed && mapping.length > 0) mapping[0] = { kind: "phone" };
  return mapping;
}

export function mappingError(mapping: ColumnTarget[]): string | null {
  const phones = mapping.filter((m) => m.kind === "phone").length;
  if (phones === 0) return "Elige qué columna tiene el teléfono";
  if (phones > 1) return "Solo una columna puede ser el teléfono";
  if (mapping.filter((m) => m.kind === "name").length > 1) return "Solo una columna puede ser el nombre";
  const fields = mapping.filter((m): m is { kind: "field"; definitionId: string } => m.kind === "field").map((m) => m.definitionId);
  if (new Set(fields).size !== fields.length) return "Un campo personalizado está asignado a dos columnas";
  return null;
}

const TRUE_VALUES = ["si", "sí", "true", "1", "yes", "x"];
const FALSE_VALUES = ["no", "false", "0"];

/** Valor normalizado para guardar, o un error legible. Vacío = no se guarda. */
export function normalizeFieldValue(def: FieldDefinition, raw: string): { value: string | null } | { error: string } {
  const value = raw.trim();
  if (!value) return { value: null };
  switch (def.type) {
    case "NUMBER": {
      const n = Number(value.replace(/[$,\s]/g, ""));
      return Number.isFinite(n) ? { value: String(n) } : { error: `"${def.label}" debe ser un número` };
    }
    case "DATE": {
      const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
      const dmy = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      const key = iso ?? (dmy ? `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}` : null);
      if (!key || Number.isNaN(Date.parse(`${key}T00:00:00Z`))) return { error: `"${def.label}" debe ser una fecha (AAAA-MM-DD o DD/MM/AAAA)` };
      return { value: key };
    }
    case "BOOLEAN": {
      const lower = value.toLowerCase();
      if (TRUE_VALUES.includes(lower)) return { value: "true" };
      if (FALSE_VALUES.includes(lower)) return { value: "false" };
      return { error: `"${def.label}" debe ser sí o no` };
    }
    case "SELECT": {
      const option = def.options.find((o) => o.toLowerCase() === value.toLowerCase());
      return option ? { value: option } : { error: `"${def.label}" no tiene la opción "${value}"` };
    }
    default:
      return { value: value.slice(0, 1000) };
  }
}

export interface ImportRow {
  phone: string;
  name: string | null;
  tags: string[];
  fields: Record<string, string>;
}

export interface ImportIssue {
  /** Número de fila del archivo (la cabecera es la 1). */
  line: number;
  message: string;
}

export interface ImportPlan {
  rows: ImportRow[];
  issues: ImportIssue[];
  tagNames: string[];
  duplicatesInFile: number;
}

export function splitTags(raw: string): string[] {
  return raw
    .split(/[;|]/)
    .map((tag) => tag.trim().slice(0, 50))
    .filter(Boolean);
}

/**
 * Aplica el mapeo: normaliza teléfonos (8–15 dígitos), deduplica por teléfono
 * dentro del archivo (gana la primera fila) y valida los campos. Una fila con
 * teléfono inválido se descarta; un campo inválido solo se omite (la fila sí entra).
 */
export function buildImportPlan(table: { rows: string[][] }, mapping: ColumnTarget[], definitions: FieldDefinition[]): ImportPlan {
  const defsById = new Map(definitions.map((d) => [d.id, d]));
  const byPhone = new Map<string, ImportRow>();
  const issues: ImportIssue[] = [];
  const tagNames = new Set<string>();
  let duplicatesInFile = 0;

  table.rows.forEach((cells, index) => {
    const line = index + 2;
    if (cells.every((cell) => !cell.trim())) return;
    const row: ImportRow = { phone: "", name: null, tags: [], fields: {} };
    mapping.forEach((target, column) => {
      const raw = (cells[column] ?? "").trim();
      if (target.kind === "phone") row.phone = raw.replace(/\D/g, "");
      else if (target.kind === "name") row.name = raw.slice(0, 200) || null;
      else if (target.kind === "tag") row.tags.push(...splitTags(raw));
      else if (target.kind === "field") {
        const def = defsById.get(target.definitionId);
        if (!def) return;
        const result = normalizeFieldValue(def, raw);
        if ("error" in result) issues.push({ line, message: result.error });
        else if (result.value !== null) row.fields[def.id] = result.value;
      }
    });
    if (row.phone.length < 8 || row.phone.length > 15) {
      issues.push({ line, message: row.phone ? `Teléfono inválido (${row.phone})` : "Sin teléfono" });
      return;
    }
    if (byPhone.has(row.phone)) {
      duplicatesInFile++;
      return;
    }
    row.tags = Array.from(new Set(row.tags));
    row.tags.forEach((tag) => tagNames.add(tag));
    byPhone.set(row.phone, row);
  });

  return { rows: Array.from(byPhone.values()), issues, tagNames: Array.from(tagNames), duplicatesInFile };
}
