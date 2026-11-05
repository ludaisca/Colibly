import { prisma } from "@/lib/prisma";
import { daysUntil } from "@/lib/billing/state";
import { ACTIVATION_WINDOW_DAYS, buildFunnel, coreProgress, stuckAt, ACTIVATION_STEP_TODO, type ActivationStamps, type ActivationStep, type FunnelRow } from "./rules";

// Embudo de activación para /plataforma (pestaña Activación): cohorte de
// organizaciones registradas en los últimos N días, con los sellos de
// OrgActivation. Las que aún no tienen fila (el tick no las ha visto) cuentan
// como registradas sin ningún otro paso.

export { COHORT_DAYS } from "./rules";
const DAY = 24 * 60 * 60 * 1000;

export interface StuckOrg {
  id: string;
  name: string;
  ownerName: string | null;
  ownerEmail: string | null;
  createdAt: string;
  trialDaysLeft: number | null;
  stuckAt: ActivationStep | null;
  stuckLabel: string;
  progress: number;
  nudgesSent: string[];
  optOut: boolean;
}

export interface ActivationReport {
  cohortDays: number;
  signups: number;
  funnel: FunnelRow[];
  /** En prueba, de la que lleva más días sin avanzar a la más reciente. */
  trialing: StuckOrg[];
  generatedAt: string;
}

const EMPTY: ActivationStamps = {
  emailVerifiedAt: null,
  channelAt: null,
  firstInboundAt: null,
  firstReplyAt: null,
  automationAt: null,
  teamAt: null,
  paidAt: null,
};

export async function getActivationReport(cohortDays: number, now = new Date()): Promise<ActivationReport> {
  const days = Math.min(Math.max(1, Math.round(cohortDays)), ACTIVATION_WINDOW_DAYS);
  const since = new Date(now.getTime() - days * DAY);
  const orgs = await prisma.organization.findMany({
    where: { isInternal: false, createdAt: { gte: since } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      status: true,
      createdAt: true,
      trialEndsAt: true,
      owner: { select: { name: true, email: true } },
      activation: true,
    },
  });

  const rows = orgs.map((o) => {
    const a = o.activation;
    const stamps: ActivationStamps = a
      ? {
          emailVerifiedAt: a.emailVerifiedAt,
          channelAt: a.channelAt,
          firstInboundAt: a.firstInboundAt,
          firstReplyAt: a.firstReplyAt,
          automationAt: a.automationAt,
          teamAt: a.teamAt,
          paidAt: a.paidAt,
        }
      : EMPTY;
    return { org: o, stamps };
  });

  const trialing: StuckOrg[] = rows
    .filter((r) => r.org.status === "TRIALING")
    .map(({ org, stamps }) => {
      const step = stuckAt(stamps);
      return {
        id: org.id,
        name: org.name,
        ownerName: org.owner?.name ?? null,
        ownerEmail: org.owner?.email ?? null,
        createdAt: org.createdAt.toISOString(),
        trialDaysLeft: org.trialEndsAt ? daysUntil(org.trialEndsAt, now) : null,
        stuckAt: step,
        stuckLabel: step ? `Falta ${ACTIVATION_STEP_TODO[step]}` : "Completó todo",
        progress: coreProgress(stamps),
        nudgesSent: org.activation?.nudgesSent ?? [],
        optOut: org.activation?.nudgesOptOut ?? false,
      };
    })
    // Primero las que menos avanzaron y menos prueba les queda: a esas hay que llamarles.
    .sort((a, b) => a.progress - b.progress || (a.trialDaysLeft ?? 99) - (b.trialDaysLeft ?? 99));

  return {
    cohortDays: days,
    signups: orgs.length,
    funnel: buildFunnel(rows.map((r) => ({ createdAt: r.org.createdAt, stamps: r.stamps }))),
    trialing,
    generatedAt: now.toISOString(),
  };
}
