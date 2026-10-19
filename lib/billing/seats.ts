import { prisma } from "@/lib/prisma";
import { MAX_SEATS, MIN_SEATS, PLANS } from "./plans";
import { planChangeImpact, type PlanChangeImpact } from "./state";
import { getSeatUsage, invalidateOrgBilling } from "./gates";
import { priceIdFor, syncSubscription, updateSubscriptionItem } from "./stripe";
import type { PlanId } from "@prisma/client";

// Cambio de plan y/o asientos de una suscripción que ya existe (la primera se
// contrata por Checkout). Reglas en state.ts:planChangeImpact(): los
// bloqueos impiden el cambio; los avisos exigen confirm=true (la pantalla los
// muestra antes de pedir la confirmación).

export type PlanChangeResult =
  | { ok: true; changed: boolean }
  | { ok: false; status: number; code: "not_found" | "internal" | "no_subscription" | "invalid_seats" | "blocked" | "confirm_required"; error: string; impact?: PlanChangeImpact };

export async function applyPlanChange(organizationId: string, input: { plan: PlanId; seats: number; confirm: boolean }): Promise<PlanChangeResult> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, plan: true, status: true, isInternal: true, seatQuantity: true, stripeSubscriptionId: true },
  });
  if (!org) return { ok: false, status: 404, code: "not_found", error: "Organización no encontrada" };
  if (org.isInternal) return { ok: false, status: 400, code: "internal", error: "Esta cuenta interna no requiere plan" };
  if (!org.stripeSubscriptionId || org.status === "CANCELED") {
    return { ok: false, status: 409, code: "no_subscription", error: "Aún no tienes una suscripción activa: elige un plan primero." };
  }
  if (!Number.isInteger(input.seats) || input.seats < MIN_SEATS || input.seats > MAX_SEATS) {
    return { ok: false, status: 400, code: "invalid_seats", error: `Los asientos deben ser entre ${MIN_SEATS} y ${MAX_SEATS}.` };
  }
  if (input.plan === org.plan && input.seats === org.seatQuantity) return { ok: true, changed: false };

  const impact = planChangeImpact(input.plan, input.seats, await getSeatUsage(organizationId));
  if (impact.blockers.length > 0) return { ok: false, status: 409, code: "blocked", error: impact.blockers[0], impact };
  if (impact.warnings.length > 0 && !input.confirm) {
    return { ok: false, status: 409, code: "confirm_required", error: `Revisa lo que cambia al pasar a ${PLANS[input.plan].name} antes de confirmar.`, impact };
  }

  await updateSubscriptionItem(org.stripeSubscriptionId, { priceId: await priceIdFor(input.plan), quantity: input.seats });
  // El webhook customer.subscription.updated también sincroniza; esto lo hace
  // visible de inmediato en la pantalla.
  await syncSubscription(org.stripeSubscriptionId, org.id);
  invalidateOrgBilling(org.id);
  return { ok: true, changed: true };
}
