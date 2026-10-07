import { z } from "zod";

const optText = (max: number) => z.string().trim().max(max).nullable().optional();

export const personCreateSchema = z.object({
  name: z.string().trim().min(1, "Indica el nombre").max(200),
  email: optText(254),
  phone: optText(40),
  jobTitle: optText(120),
  companyId: z.string().min(1).nullable().optional(),
  ownerId: z.string().min(1).nullable().optional(),
  lifecycle: z.enum(["LEAD", "CUSTOMER"]).optional(),
  // Crear aunque ya exista alguien con el mismo correo/teléfono.
  allowDuplicate: z.boolean().optional(),
});

export const personUpdateSchema = z.object({
  expectedVersion: z.number().int().positive("Falta la versión del registro"),
  name: z.string().trim().min(1, "Indica el nombre").max(200).optional(),
  email: optText(254),
  phone: optText(40),
  jobTitle: optText(120),
  companyId: z.string().min(1).nullable().optional(),
  ownerId: z.string().min(1).nullable().optional(),
  lifecycle: z.enum(["LEAD", "CUSTOMER"]).optional(),
  archived: z.boolean().optional(),
});

export const companyCreateSchema = z.object({
  name: z.string().trim().min(1, "Indica el nombre").max(200),
  domain: optText(200),
  industry: optText(120),
  size: optText(60),
  location: optText(200),
  notes: optText(5000),
  ownerId: z.string().min(1).nullable().optional(),
  allowDuplicate: z.boolean().optional(),
});

export const companyUpdateSchema = z.object({
  expectedVersion: z.number().int().positive("Falta la versión del registro"),
  name: z.string().trim().min(1).max(200).optional(),
  domain: optText(200),
  industry: optText(120),
  size: optText(60),
  location: optText(200),
  notes: optText(5000),
  ownerId: z.string().min(1).nullable().optional(),
  archived: z.boolean().optional(),
});

export const mergeSchema = z.object({
  targetId: z.string().min(1),
  sourceId: z.string().min(1),
});

export const bulkSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "Selecciona al menos un contacto").max(200, "Máximo 200 a la vez"),
  action: z.enum(["assign_owner", "archive", "restore", "set_company"]),
  ownerId: z.string().min(1).nullable().optional(),
  companyId: z.string().min(1).nullable().optional(),
});

export const importSchema = z.object({
  csv: z.string().min(1, "Falta el archivo"),
  mapping: z
    .object({
      name: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      company: z.string().optional(),
      jobTitle: z.string().optional(),
    })
    .optional(),
  fingerprint: z.string().optional(),
});

// Filtros de listado de personas — los mismos que guardan las vistas.
export const peopleFiltersSchema = z.object({
  q: z.string().trim().max(200).optional(),
  ownerId: z.string().optional(), // id | "none" | "me"
  companyId: z.string().optional(), // id | "none"
  lifecycle: z.enum(["LEAD", "CUSTOMER"]).optional(),
  archived: z.enum(["exclude", "only", "include"]).optional(),
  channel: z.enum(["WHATSAPP", "TELEGRAM", "MESSENGER", "INSTAGRAM", "WEBCHAT"]).optional(),
  tagId: z.string().optional(),
  // Personas con un negocio ABIERTO en esa etapa (el ejecutivo, solo entre los suyos).
  stageId: z.string().optional(),
  createdFrom: z.string().datetime({ offset: true }).optional(),
  createdTo: z.string().datetime({ offset: true }).optional(),
  sort: z.enum(["recent", "newest", "name"]).optional(),
});
export type PeopleFilters = z.infer<typeof peopleFiltersSchema>;

export const companyFiltersSchema = z.object({
  q: z.string().trim().max(200).optional(),
  ownerId: z.string().optional(),
  archived: z.enum(["exclude", "only", "include"]).optional(),
  sort: z.enum(["recent", "name"]).optional(),
});
export type CompanyFilters = z.infer<typeof companyFiltersSchema>;

export const viewSchema = z.object({
  entity: z.enum(["PEOPLE", "COMPANIES"]),
  name: z.string().trim().min(1, "Indica el nombre de la vista").max(80),
  filters: z.record(z.string(), z.unknown()),
  shared: z.boolean().optional(),
});
export const viewUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  filters: z.record(z.string(), z.unknown()).optional(),
  shared: z.boolean().optional(),
});

export function filtersFromParams(params: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of params) if (v !== "" && k !== "page" && k !== "pageSize") out[k] = v;
  return out;
}

export function pageFromParams(params: URLSearchParams): { page: number; pageSize: number } {
  const page = Math.max(1, Number(params.get("page")) || 1);
  const pageSize = Math.min(Math.max(Number(params.get("pageSize")) || 25, 1), 100);
  return { page, pageSize };
}
