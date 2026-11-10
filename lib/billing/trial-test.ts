import { prisma } from "@/lib/prisma";
import { TRIAL_AI_TEST_CREDITS } from "@/lib/billing/plans";
import { invalidateOrgBilling } from "@/lib/billing/gates";

// Prueba sin canal: una organización en prueba que todavía no conecta nada
// puede probar el bot y la IA, pero con una bolsa chica de la ORGANIZACIÓN
// (TRIAL_AI_TEST_CREDITS) en lugar de los créditos personales. Cada mensaje
// cuesta dinero a la plataforma. Al conectar el primer canal aplican los
// créditos normales de la prueba, sin tocar esta bolsa.

export type TrialTestMode = "channelless_trial" | "normal";

export interface TrialTestStatus {
  used: number;
  max: number;
  remaining: number;
  mode: TrialTestMode;
}

export const TRIAL_TEST_EXHAUSTED_MESSAGE =
  `Ya usaste tus ${TRIAL_AI_TEST_CREDITS} mensajes de prueba. Conecta tu WhatsApp para seguir probando con tus clientes reales o elige un plan.`;
export const TRIAL_TEST_ACTION_URL = "/whatsapp/cuentas";

/** Reglas puras del modo: en prueba, no interna y sin ninguna cuenta de WhatsApp ni de otro canal. */
export function isChannellessTrialState(input: { status: string; isInternal: boolean; waAccounts: number; channelAccounts: number }): boolean {
  return input.status === "TRIALING" && !input.isInternal && input.waAccounts === 0 && input.channelAccounts === 0;
}

export async function isChannellessTrial(organizationId: string): Promise<boolean> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { status: true, isInternal: true, _count: { select: { waAccounts: true, channelAccounts: true } } },
  });
  if (!org) return false;
  return isChannellessTrialState({ status: org.status, isInternal: org.isInternal, waAccounts: org._count.waAccounts, channelAccounts: org._count.channelAccounts });
}

export function trialTestStatusOf(used: number, mode: TrialTestMode): TrialTestStatus {
  return { used, max: TRIAL_AI_TEST_CREDITS, remaining: Math.max(0, TRIAL_AI_TEST_CREDITS - used), mode };
}

export async function trialTestStatus(organizationId: string): Promise<TrialTestStatus> {
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { trialTestAiUsed: true } });
  const mode: TrialTestMode = (await isChannellessTrial(organizationId)) ? "channelless_trial" : "normal";
  return trialTestStatusOf(org?.trialTestAiUsed ?? 0, mode);
}

/** Reserva atómica con tope: dos llamadas con 1 crédito libre no pasan las dos. */
export async function reserveTrialTestCredit(organizationId: string): Promise<boolean> {
  const { count } = await prisma.organization.updateMany({
    where: { id: organizationId, trialTestAiUsed: { lt: TRIAL_AI_TEST_CREDITS } },
    data: { trialTestAiUsed: { increment: 1 } },
  });
  invalidateOrgBilling(organizationId);
  return count > 0;
}

/** Devuelve el crédito si la llamada al proveedor falló (no castigamos una caída nuestra). */
export async function refundTrialTestCredit(organizationId: string): Promise<void> {
  await prisma.organization.updateMany({
    where: { id: organizationId, trialTestAiUsed: { gt: 0 } },
    data: { trialTestAiUsed: { decrement: 1 } },
  });
  invalidateOrgBilling(organizationId);
}
