import { notFound, redirect } from "next/navigation";
import type { OrganizationStatus, Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPlatformAdminEmail } from "@/lib/platform-admin";
import { aiCreditLimit } from "@/lib/billing/state";
import { orgAiCreditSummary } from "@/lib/ai/credits";
import { PLANS } from "@/lib/billing/plans";
import { Suspense } from "react";
import { PlatformView, type PlatformOrgRow, type PlatformSummary } from "./_view";

const PAGE_SIZE = 50;
const STATUSES: OrganizationStatus[] = ["TRIALING", "ACTIVE", "PAST_DUE", "READ_ONLY", "CANCELED", "SUSPENDED"];

// Panel del operador de la plataforma (PLATFORM_ADMIN_EMAILS): todas las
// organizaciones, su estado de cobro y acciones de soporte. A quien no es
// operador, 404 — la página no se anuncia.
export default async function PlatformPage({ searchParams }: { searchParams: Promise<{ q?: string; estado?: string; pagina?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!isPlatformAdminEmail(session.user.email)) notFound();

  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const status = STATUSES.includes(sp.estado as OrganizationStatus) ? (sp.estado as OrganizationStatus) : null;
  const page = Math.max(1, Number.parseInt(sp.pagina ?? "1", 10) || 1);

  const where: Prisma.OrganizationWhereInput = {
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { members: { some: { email: { contains: q, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const [total, orgs, byStatus, activeByPlan, signups7d] = await Promise.all([
    prisma.organization.count({ where }),
    prisma.organization.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      select: {
        id: true,
        name: true,
        plan: true,
        status: true,
        isInternal: true,
        trialEndsAt: true,
        currentPeriodEnd: true,
        canceledAt: true,
        createdAt: true,
        aiCreditsUsed: true,
        aiCreditsBonus: true,
        seatQuantity: true,
        licensesEssential: true,
        licensesBusiness: true,
        licensesPro: true,
        legacyUntil: true,
        stripeSubscriptionId: true,
        channelTelegramEnabled: true,
        channelMessengerEnabled: true,
        channelInstagramEnabled: true,
        channelWebchatEnabled: true,
        channelWhatsappWebEnabled: true,
        whatsappCoexistenceEnabled: true,
        owner: { select: { name: true, email: true, emailVerifiedAt: true } },
        _count: { select: { members: true, waAccounts: true, channelAccounts: true } },
      },
    }),
    prisma.organization.groupBy({ by: ["status"], where: { isInternal: false }, _count: true }),
    // MRR por licencias contratadas (una línea de Stripe por plan).
    prisma.organization.aggregate({ where: { isInternal: false, status: "ACTIVE" }, _sum: { licensesEssential: true, licensesBusiness: true, licensesPro: true } }),
    prisma.organization.count({ where: { isInternal: false, createdAt: { gte: weekAgo } } }),
  ]);

  const count = (s: OrganizationStatus) => byStatus.find((b) => b.status === s)?._count ?? 0;
  const summary: PlatformSummary = {
    total: byStatus.reduce((n, b) => n + b._count, 0),
    trialing: count("TRIALING"),
    paying: count("ACTIVE"),
    pastDue: count("PAST_DUE"),
    inactive: count("READ_ONLY") + count("CANCELED"),
    suspended: count("SUSPENDED"),
    mrrMxn:
      (activeByPlan._sum.licensesEssential ?? 0) * PLANS.ESSENTIAL.pricePerSeatMxn +
      (activeByPlan._sum.licensesBusiness ?? 0) * PLANS.BUSINESS.pricePerSeatMxn +
      (activeByPlan._sum.licensesPro ?? 0) * PLANS.PRO.pricePerSeatMxn,
    signups7d,
  };

  // Créditos: con licencias, la suma de las personas; en legacy, la bolsa.
  const credits = await Promise.all(orgs.map((o) => orgAiCreditSummary(o.id)));
  const rows: PlatformOrgRow[] = orgs.map((o, i) => {
    const limit = credits[i]?.limit ?? aiCreditLimit(o);
    return {
      id: o.id,
      name: o.name,
      plan: o.plan,
      status: o.status,
      isInternal: o.isInternal,
      trialEndsAt: o.trialEndsAt?.toISOString() ?? null,
      currentPeriodEnd: o.currentPeriodEnd?.toISOString() ?? null,
      canceledAt: o.canceledAt?.toISOString() ?? null,
      createdAt: o.createdAt.toISOString(),
      aiCreditsUsed: credits[i]?.used ?? o.aiCreditsUsed,
      aiCreditsBonus: credits[i]?.bonus ?? o.aiCreditsBonus,
      licenses: { ESSENTIAL: o.licensesEssential, BUSINESS: o.licensesBusiness, PRO: o.licensesPro },
      legacy: !!o.legacyUntil && o.legacyUntil > new Date(),
      aiCreditsLimit: Number.isFinite(limit) ? limit : null,
      hasSubscription: !!o.stripeSubscriptionId,
      ownerName: o.owner?.name ?? null,
      ownerEmail: o.owner?.email ?? null,
      ownerVerified: !!o.owner?.emailVerifiedAt,
      members: o._count.members,
      channels: o._count.waAccounts + o._count.channelAccounts,
      whatsappCoexistence: o.whatsappCoexistenceEnabled,
      whatsappWeb: o.channelWhatsappWebEnabled,
      channelFlags: {
        telegram: o.channelTelegramEnabled,
        messenger: o.channelMessengerEnabled,
        instagram: o.channelInstagramEnabled,
        webchat: o.channelWebchatEnabled,
      },
    };
  });

  return (
    // PlatformView lee `?tab=` (useUrlTab → useSearchParams).
    <Suspense fallback={null}>
      <PlatformView
        summary={summary}
        rows={rows}
        total={total}
        page={page}
        totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))}
        filters={{ q, status }}
      />
    </Suspense>
  );
}
