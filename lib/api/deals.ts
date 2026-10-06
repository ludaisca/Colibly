import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { CrmError } from "@/lib/crm/errors";
import type { CrmActor } from "@/lib/crm/access";
import { dealSelect, serializeDeal } from "@/lib/crm/deals";
import type { ApiContext } from "./auth";
import { ApiError, type ApiErrorCode } from "./respond";
import { contactScopeWhere } from "./resources";

// Puente entre la API pública y el servicio de negocios del CRM (lib/crm).

// Las keys son de admins, así que operan como admin de su organización; lo que
// no pueden ver lo recorta `dealScopeWhere` (cuentas de la key).
export function apiActor(ctx: ApiContext): CrmActor {
  return { userId: ctx.userId, organizationId: ctx.organizationId, role: "admin" };
}

// Negocios dentro del alcance de la key: los ligados a una conversación de sus
// cuentas y, si la key no está recortada, los que no tienen conversación.
export function dealScopeWhere(ctx: ApiContext): Prisma.DealWhereInput {
  const inScope: Prisma.DealWhereInput = { contact: contactScopeWhere(ctx) };
  return { organizationId: ctx.organizationId, ...(ctx.restricted ? inScope : { OR: [{ contactId: null }, inScope] }) };
}

export async function findScopedDeal(ctx: ApiContext, id: string) {
  const deal = await prisma.deal.findFirst({ where: { id, ...dealScopeWhere(ctx) }, select: dealSelect });
  if (!deal) throw new ApiError(404, "not_found", "Negocio no encontrado");
  return deal;
}

export const serializeApiDeal = serializeDeal;

const CODE_MAP: Record<string, ApiErrorCode> = {
  not_found: "not_found",
  forbidden: "forbidden",
  version_conflict: "conflict",
  duplicate_name: "conflict",
  duplicate_person: "conflict",
  duplicate_import: "conflict",
  plan_limit: "plan_limit",
};

// Errores del servicio CRM → forma de error de la API pública.
export async function crmCall<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof CrmError) {
      const code = CODE_MAP[err.code] ?? (err.status === 409 ? "conflict" : "invalid_request");
      throw new ApiError(err.status, code, err.message);
    }
    if (err instanceof ZodError) throw new ApiError(400, "invalid_request", err.issues[0]?.message ?? "Datos inválidos");
    throw err;
  }
}
