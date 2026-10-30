import type { OrganizationStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { invalidateUserSessionCache } from "@/lib/auth";
import { invalidateOrgBilling } from "@/lib/billing/gates";
import { extendTrial, MAX_TRIAL_EXTENSION_DAYS, statusAfterSuspension } from "@/lib/billing/state";
import { isStripeConfigured, syncSubscription } from "@/lib/billing/stripe";
import { getPlatformSettings, PLATFORM_SECRET_FIELDS, updatePlatformSettings, type PlatformSecretField } from "@/lib/platform-settings";
import { platformBackupQueue } from "@/lib/queue";
import { resolveBackupConfig } from "@/lib/backups/config";
import { testConnection } from "@/lib/backups/s3";
import { sendEmail } from "@/lib/email/mailer";
import { appUrl } from "@/lib/app-url";
import { getPlatformDiagnostics } from "./diagnostics";
import { reconcileCatalog, type ReconcileResult } from "./catalog";
import { rotateStripeWebhook, testStripeWebhook } from "./webhook-rotate";
import { logPlatformAction } from "./audit";

// Operaciones compartidas por el API v1 y el MCP. Devuelven resultados, no
// NextResponse, para que cada superficie decida cómo responder.

export interface PlatformActor {
  type: "user" | "token";
  email: string;
  tokenId?: string | null;
  environment?: string;
}

export type OpsResult<T> = { ok: true; data: T } | { ok: false; status: number; code: string; message: string };

const MAX_BONUS_CREDITS = 100_000;

function fail(status: number, code: string, message: string): { ok: false; status: number; code: string; message: string } {
  return { ok: false, status, code, message };
}

export async function listOrganizations(input: { q?: string; status?: string; page?: number; pageSize?: number }) {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 50));
  const where: Prisma.OrganizationWhereInput = {
    ...(input.status ? { status: input.status as OrganizationStatus } : {}),
    ...(input.q
      ? {
          OR: [
            { name: { contains: input.q, mode: "insensitive" } },
            { members: { some: { email: { contains: input.q, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };
  const [total, items] = await Promise.all([
    prisma.organization.count({ where }),
    prisma.organization.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        name: true,
        status: true,
        plan: true,
        isInternal: true,
        seatQuantity: true,
        trialEndsAt: true,
        canceledAt: true,
        currentPeriodEnd: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        createdAt: true,
        _count: { select: { members: true, waAccounts: true, channelAccounts: true } },
      },
    }),
  ]);
  return { items, total, page, pageSize };
}

export async function getOrganization(id: string) {
  const org = await prisma.organization.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      status: true,
      plan: true,
      isInternal: true,
      seatQuantity: true,
      trialEndsAt: true,
      canceledAt: true,
      currentPeriodEnd: true,
      graceEndsAt: true,
      cancelAtPeriodEnd: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      aiCreditsUsed: true,
      aiCreditsBonus: true,
      whatsappCoexistenceEnabled: true,
      channelTelegramEnabled: true,
      channelMessengerEnabled: true,
      channelInstagramEnabled: true,
      channelWebchatEnabled: true,
      createdAt: true,
      owner: { select: { email: true, name: true } },
      _count: { select: { members: true, waAccounts: true, channelAccounts: true, campaigns: true } },
    },
  });
  return org ? { ...org, organizationId: org.id } : null;
}

export async function extendOrgTrial(id: string, days: number, actor: PlatformActor): Promise<OpsResult<unknown>> {
  if (!Number.isInteger(days) || days < 1 || days > MAX_TRIAL_EXTENSION_DAYS) {
    return fail(400, "invalid_request", `Los días deben ser entre 1 y ${MAX_TRIAL_EXTENSION_DAYS}`);
  }
  const org = await prisma.organization.findUnique({
    where: { id },
    select: { id: true, name: true, status: true, isInternal: true, trialEndsAt: true, canceledAt: true, stripeSubscriptionId: true },
  });
  if (!org) return fail(404, "not_found", "Organización no encontrada");

  const result = extendTrial(org, days, new Date());
  if ("error" in result) return fail(400, "invalid_request", result.error);

  const updated = await prisma.organization.update({
    where: { id },
    data: { ...result, lastBillingNotice: null },
    select: { status: true, trialEndsAt: true },
  });
  invalidateOrgBilling(id);
  await logPlatformAction({
    actor: { type: actor.type, email: actor.email, tokenId: actor.tokenId },
    action: "org.extend_trial",
    target: { type: "organization", id },
    before: { trialEndsAt: org.trialEndsAt },
    after: { days, trialEndsAt: updated.trialEndsAt },
  });
  return { ok: true, data: updated };
}

export async function grantOrgCredits(id: string, credits: number, actor: PlatformActor): Promise<OpsResult<unknown>> {
  if (!Number.isInteger(credits) || credits < 1 || credits > MAX_BONUS_CREDITS) {
    return fail(400, "invalid_request", `Los créditos deben ser entre 1 y ${MAX_BONUS_CREDITS}`);
  }
  const org = await prisma.organization.findUnique({ where: { id }, select: { id: true, isInternal: true, aiCreditsBonus: true } });
  if (!org) return fail(404, "not_found", "Organización no encontrada");
  if (org.isInternal) return fail(400, "invalid_request", "Una organización interna no tiene límite de créditos");

  const updated = await prisma.organization.update({
    where: { id },
    data: { aiCreditsBonus: { increment: credits }, aiCreditsAlertLevel: 0 },
    select: { aiCreditsBonus: true },
  });
  await logPlatformAction({
    actor: { type: actor.type, email: actor.email, tokenId: actor.tokenId },
    action: "org.grant_credits",
    target: { type: "organization", id },
    before: { aiCreditsBonus: org.aiCreditsBonus },
    after: { aiCreditsBonus: updated.aiCreditsBonus },
  });
  return { ok: true, data: updated };
}

export async function suspendOrg(id: string, actor: PlatformActor): Promise<OpsResult<unknown>> {
  const org = await prisma.organization.findUnique({
    where: { id },
    select: { id: true, name: true, status: true, isInternal: true, members: { select: { id: true, email: true } } },
  });
  if (!org) return fail(404, "not_found", "Organización no encontrada");
  if (org.isInternal) return fail(400, "invalid_request", "Una organización interna no se puede suspender");
  if (org.members.some((member) => member.email.toLowerCase() === actor.email.toLowerCase())) {
    return fail(400, "invalid_request", "No puedes suspender tu propia organización");
  }
  if (org.status === "SUSPENDED") return fail(400, "invalid_request", "Ya está suspendida");

  await prisma.organization.update({ where: { id }, data: { status: "SUSPENDED" } });
  for (const member of org.members) invalidateUserSessionCache(member.id);
  invalidateOrgBilling(id);
  await logPlatformAction({
    actor: { type: actor.type, email: actor.email, tokenId: actor.tokenId },
    action: "org.suspend",
    target: { type: "organization", id },
    before: { status: org.status },
    after: { status: "SUSPENDED" },
  });
  return { ok: true, data: { status: "SUSPENDED" } };
}

export async function reactivateOrg(id: string, actor: PlatformActor): Promise<OpsResult<unknown>> {
  const org = await prisma.organization.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      status: true,
      isInternal: true,
      trialEndsAt: true,
      canceledAt: true,
      stripeSubscriptionId: true,
      members: { select: { id: true } },
    },
  });
  if (!org) return fail(404, "not_found", "Organización no encontrada");
  if (org.status !== "SUSPENDED") return fail(400, "invalid_request", "No está suspendida");

  if (org.stripeSubscriptionId && (await isStripeConfigured())) {
    await prisma.organization.update({ where: { id }, data: { status: "READ_ONLY" } });
    invalidateOrgBilling(id);
    await syncSubscription(org.stripeSubscriptionId, id);
  } else {
    await prisma.organization.update({ where: { id }, data: { status: statusAfterSuspension(org, new Date()) } });
  }
  for (const member of org.members) invalidateUserSessionCache(member.id);
  invalidateOrgBilling(id);

  const updated = await prisma.organization.findUniqueOrThrow({ where: { id }, select: { status: true } });
  await logPlatformAction({
    actor: { type: actor.type, email: actor.email, tokenId: actor.tokenId },
    action: "org.reactivate",
    target: { type: "organization", id },
    before: { status: "SUSPENDED" },
    after: { status: updated.status },
  });
  return { ok: true, data: updated };
}

export async function getBillingState(): Promise<OpsResult<unknown>> {
  const report = await getPlatformDiagnostics({ live: true });
  return {
    ok: true,
    data: {
      status: report.status,
      checkedAt: report.checkedAt,
      checks: report.checks.filter((check) => check.id.startsWith("billing.")),
    },
  };
}

export async function reconcilePrices(input: { dryRun: boolean; actor: PlatformActor }): Promise<OpsResult<ReconcileResult>> {
  try {
    const result = await reconcileCatalog({ dryRun: input.dryRun, actorEmail: input.actor.email });
    if (!input.dryRun) {
      await logPlatformAction({
        actor: { type: input.actor.type, email: input.actor.email, tokenId: input.actor.tokenId },
        action: "billing.prices.apply",
        target: { type: "stripe_catalog", id: "prices" },
        after: { prices: result.prices, applied: result.applied },
      });
    }
    return { ok: true, data: result };
  } catch (error) {
    return fail(502, "upstream_error", error instanceof Error ? error.message : "No se pudo reconciliar el catálogo");
  }
}

export async function rotateWebhook(actor: PlatformActor): Promise<OpsResult<unknown>> {
  try {
    const result = await rotateStripeWebhook(actor.email);
    await logPlatformAction({
      actor: { type: actor.type, email: actor.email, tokenId: actor.tokenId },
      action: "billing.webhook.rotate",
      target: { type: "stripe_webhook", id: result.endpointId },
      after: { url: result.url, events: result.events.length },
    });
    return { ok: true, data: result };
  } catch (error) {
    return fail(502, "upstream_error", error instanceof Error ? error.message : "No se pudo rotar el webhook");
  }
}

export async function testWebhook(): Promise<OpsResult<unknown>> {
  try {
    const result = await testStripeWebhook();
    return result.ok ? { ok: true, data: result } : fail(502, "upstream_error", result.message);
  } catch (error) {
    return fail(502, "upstream_error", error instanceof Error ? error.message : "No se pudo probar el webhook");
  }
}

export async function runBackup(actor: PlatformActor): Promise<OpsResult<unknown>> {
  const running = await prisma.platformBackupRun.findFirst({ where: { status: "RUNNING" }, select: { id: true } });
  if (running) return fail(409, "conflict", "Ya hay un respaldo en curso");
  await platformBackupQueue.add("run", { triggeredBy: actor.email }, { jobId: `platform-backup-run-${Date.now()}` });
  await logPlatformAction({
    actor: { type: actor.type, email: actor.email, tokenId: actor.tokenId },
    action: "backup.run",
    target: { type: "platform_backup", id: "manual" },
  });
  return { ok: true, data: { queued: true } };
}

export async function testBackup(): Promise<OpsResult<unknown>> {
  const settings = await getPlatformSettings();
  const resolved = resolveBackupConfig(settings);
  if (!resolved.ok) return fail(400, "invalid_request", `Falta configurar: ${resolved.missing.join(", ")}`);
  const result = await testConnection(resolved.config);
  return result.ok ? { ok: true, data: { ok: true } } : fail(502, "upstream_error", result.error);
}

export async function testSmtp(to: string, actor: PlatformActor): Promise<OpsResult<unknown>> {
  const email = to.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(400, "invalid_request", "Correo no válido");
  try {
    await sendEmail({
      to: email,
      subject: `Prueba de SMTP de ${process.env.APP_URL ?? "Colibly"}`,
      text: "Si recibiste este correo, el SMTP de producción está funcionando.",
      html: `<p>Si recibiste este correo, el SMTP de producción está funcionando.</p><p>Enviado desde <a href="${appUrl("/")}">${appUrl("/")}</a>.</p>`,
    });
    await logPlatformAction({
      actor: { type: actor.type, email: actor.email, tokenId: actor.tokenId },
      action: "mail.test",
      target: { type: "smtp", id: email },
    });
    return { ok: true, data: { sent: true } };
  } catch (error) {
    return fail(502, "upstream_error", error instanceof Error ? error.message : "No se pudo enviar el correo");
  }
}

export async function listAudit(input: { action?: string; targetId?: string; from?: Date; to?: Date; page?: number; pageSize?: number }) {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 50));
  const where: Prisma.PlatformAuditLogWhereInput = {
    ...(input.action ? { action: { contains: input.action } } : {}),
    ...(input.targetId ? { targetId: input.targetId } : {}),
    ...(input.from || input.to
      ? { createdAt: { ...(input.from ? { gte: input.from } : {}), ...(input.to ? { lte: input.to } : {}) } }
      : {}),
  };
  const [total, items] = await Promise.all([
    prisma.platformAuditLog.count({ where }),
    prisma.platformAuditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return { items, total, page, pageSize };
}

export function isPlatformSecretField(value: string): value is PlatformSecretField {
  return (PLATFORM_SECRET_FIELDS as readonly string[]).includes(value);
}

export async function setPlatformSecret(input: {
  field: PlatformSecretField;
  value: string;
  actor: PlatformActor;
}): Promise<OpsResult<unknown>> {
  const value = input.value;
  if (typeof value !== "string" || value.length === 0 || value.length > 500) {
    return fail(400, "invalid_request", "El secreto debe tener entre 1 y 500 caracteres");
  }
  if (input.field === "stripeSecretKey") {
    const env = input.actor.environment;
    if (env === "production" && value.startsWith("sk_test_")) {
      return fail(400, "invalid_request", "Un token de producción no puede guardar una key de test");
    }
    if (env === "dev" && value.startsWith("sk_live_")) {
      return fail(400, "invalid_request", "Un token de desarrollo no puede guardar una key live");
    }
    if (!value.startsWith("sk_live_") && !value.startsWith("sk_test_")) {
      return fail(400, "invalid_request", "La key de Stripe debe empezar por sk_live_ o sk_test_");
    }
  }

  await updatePlatformSettings({ [input.field]: value }, input.actor.email);
  await logPlatformAction({
    actor: { type: input.actor.type, email: input.actor.email, tokenId: input.actor.tokenId },
    action: "config.secret.set",
    target: { type: "platform_settings", id: input.field },
    after: { [input.field]: "[set]" },
  });
  return { ok: true, data: { field: input.field, hasValue: true } };
}
