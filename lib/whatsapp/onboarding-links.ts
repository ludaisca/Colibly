import { randomBytes } from "node:crypto";
import type { WAOnboardingLink } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/crypto";
import { appUrl } from "@/lib/app-url";
import { emitDomainEvent } from "@/lib/events/emit";
import { evaluatePlanLimit, isOrgWritable } from "@/lib/billing/gates";
import { integrationOwnerHas } from "@/lib/billing/entitlements";
import { completeEmbeddedSignup, EmbeddedSignupError } from "@/lib/whatsapp/embedded-signup/complete";
import { realEmbeddedSignupDeps, requirePlatformApp } from "@/lib/whatsapp/embedded-signup/service";

// Enlaces de conexión de WhatsApp: el integrador (una agencia, un revendedor)
// crea uno por API y se lo manda a su cliente. El cliente abre
// /conectar/<token>, hace el Embedded Signup de Meta con su Facebook y el
// número entra a la organización del integrador, a nombre del admin dueño de
// la key. Mismas reglas que conectar desde el panel: correo verificado del
// admin, límite del plan, organización con escritura y coexistencia según la
// organización. Solo se guarda el sha256 del token.

export const ONBOARDING_LINK_DEFAULT_HOURS = 72;
export const ONBOARDING_LINK_MAX_HOURS = 24 * 30;

export type OnboardingLinkState = "PENDING" | "COMPLETED" | "CANCELED" | "EXPIRED";

export function onboardingLinkState(link: Pick<WAOnboardingLink, "status" | "expiresAt">, now = new Date()): OnboardingLinkState {
  if (link.status === "PENDING" && link.expiresAt <= now) return "EXPIRED";
  return link.status;
}

export function onboardingLinkUrl(token: string): string {
  return appUrl(`/conectar/${token}`);
}

export function serializeOnboardingLink(link: WAOnboardingLink, now = new Date()) {
  return {
    id: link.id,
    status: onboardingLinkState(link, now),
    name: link.name,
    reference: link.reference,
    redirectUrl: link.redirectUrl,
    accountId: link.accountId,
    lastError: link.lastError,
    expiresAt: link.expiresAt,
    completedAt: link.completedAt,
    createdAt: link.createdAt,
  };
}

export async function createOnboardingLink(
  owner: { organizationId: string; userId: string },
  input: { name?: string; reference?: string; redirectUrl?: string; expiresInHours?: number }
): Promise<{ link: WAOnboardingLink; url: string }> {
  const token = `ob_${randomBytes(24).toString("base64url")}`;
  const hours = Math.min(ONBOARDING_LINK_MAX_HOURS, Math.max(1, input.expiresInHours ?? ONBOARDING_LINK_DEFAULT_HOURS));
  const link = await prisma.wAOnboardingLink.create({
    data: {
      organizationId: owner.organizationId,
      createdById: owner.userId,
      tokenHash: hashToken(token),
      name: input.name ?? null,
      reference: input.reference ?? null,
      redirectUrl: input.redirectUrl ?? null,
      expiresAt: new Date(Date.now() + hours * 3_600_000),
    },
  });
  return { link, url: onboardingLinkUrl(token) };
}

export async function findOnboardingLinkByToken(token: string) {
  if (!/^ob_[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  return prisma.wAOnboardingLink.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { organization: { select: { name: true, whatsappCoexistenceEnabled: true } } },
  });
}

/** Lo que impide usar el enlace hoy (null = se puede). Mensajes para el cliente final. */
export async function onboardingLinkBlocker(link: WAOnboardingLink): Promise<string | null> {
  const state = onboardingLinkState(link);
  if (state === "COMPLETED") return "Este enlace ya se usó: el número quedó conectado.";
  if (state === "CANCELED") return "Este enlace fue cancelado. Pide uno nuevo a quien te lo envió.";
  if (state === "EXPIRED") return "Este enlace venció. Pide uno nuevo a quien te lo envió.";
  const creator = await prisma.user.findUnique({ where: { id: link.createdById }, select: { role: true, disabledAt: true, emailVerifiedAt: true } });
  if (!creator || creator.role !== "admin" || creator.disabledAt || !creator.emailVerifiedAt) {
    return "Este enlace ya no es válido. Pide uno nuevo a quien te lo envió.";
  }
  if (!(await isOrgWritable(link.organizationId)) || !(await integrationOwnerHas(link.createdById, "api"))) {
    return "Por ahora no se pueden conectar números con este enlace. Avísale a quien te lo envió.";
  }
  const limit = await evaluatePlanLimit(link.organizationId, "whatsapp");
  if (limit) return "Quien te envió el enlace ya no tiene lugar para otro número de WhatsApp en su plan. Avísale.";
  return null;
}

export class OnboardingLinkError extends Error {
  constructor(message: string, public readonly status: number, public readonly code: string) {
    super(message);
  }
}

/** Cierra el Embedded Signup hecho desde /conectar/<token>. */
export async function completeOnboardingLink(
  token: string,
  signup: { code: string; wabaId: string; phoneNumberId: string | null; coexistence: boolean }
): Promise<{ accountId: string; coexistence: boolean; redirectUrl: string | null; reference: string | null }> {
  const link = await findOnboardingLinkByToken(token);
  if (!link) throw new OnboardingLinkError("Enlace no válido", 404, "not_found");
  const blocker = await onboardingLinkBlocker(link);
  if (blocker) throw new OnboardingLinkError(blocker, 409, "link_unavailable");

  let result;
  try {
    const app = await requirePlatformApp();
    result = await completeEmbeddedSignup(
      {
        userId: link.createdById,
        organizationId: link.organizationId,
        code: signup.code,
        wabaId: signup.wabaId,
        phoneNumberId: signup.phoneNumberId,
        coexistenceRequested: signup.coexistence,
        coexistenceAllowed: !!link.organization.whatsappCoexistenceEnabled,
        name: link.name ?? undefined,
      },
      app,
      realEmbeddedSignupDeps(app)
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.wAOnboardingLink.update({ where: { id: link.id }, data: { lastError: message.slice(0, 500) } }).catch(() => {});
    if (err instanceof EmbeddedSignupError) throw new OnboardingLinkError(err.message, err.status, err.code);
    throw err;
  }

  await prisma.wAOnboardingLink.update({
    where: { id: link.id },
    data: { status: "COMPLETED", accountId: result.accountId, completedAt: new Date(), lastError: null },
  });
  await emitAccountConnected(result.accountId, { coexistence: result.coexistence, via: "onboarding_link", linkId: link.id, reference: link.reference });
  return { accountId: result.accountId, coexistence: result.coexistence, redirectUrl: link.redirectUrl, reference: link.reference };
}

export async function emitAccountConnected(
  accountId: string,
  data: { coexistence: boolean; via: "app" | "onboarding_link"; linkId?: string | null; reference?: string | null }
): Promise<void> {
  await emitDomainEvent({
    type: "account.connected",
    account: { kind: "whatsapp", id: accountId },
    contactId: null,
    chat: null,
    data: { accountId, coexistence: data.coexistence, via: data.via, linkId: data.linkId ?? null, reference: data.reference ?? null },
  });
}

/** URL de regreso con el resultado, para el integrador. */
export function redirectWithResult(redirectUrl: string, result: { status: "connected"; accountId: string; reference: string | null }): string {
  const url = new URL(redirectUrl);
  url.searchParams.set("status", result.status);
  url.searchParams.set("accountId", result.accountId);
  if (result.reference) url.searchParams.set("reference", result.reference);
  return url.toString();
}
