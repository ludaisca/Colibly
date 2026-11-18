import { NextResponse } from "next/server";
import type { PlanId } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { BILLING_PLAN_PATH, getOrgBilling, USERS_PATH, type OrgBilling } from "./gates";
import { catalogMode, channelLicense, featureBlockedMessage, hasFeature, legacyHasFeature, type CatalogMode, type LicenseFeature } from "./licenses";
import { PLANS } from "./plans";
import { planLimits } from "./state";

// Candados por licencia (docs/PLAN_LICENCIAS_2026-11-04.md, reglas 3–7):
//   · por persona: lo que pide alguien depende de SU licencia;
//   · por canal: lo automático sobre una conversación depende de la licencia
//     del DUEÑO del canal (sin dueño activo, Básico);
//   · por integración: API keys, webhooks y Meta Ads viven mientras su dueño
//     sea admin activo con una licencia que los incluya.
// Las organizaciones internas no tienen topes y las que conservan el catálogo
// anterior (`legacyUntil`) siguen con plans.ts a nivel organización.

export type ChannelRef = { waAccountId?: string | null; channelAccountId?: string | null };

interface Holder {
  id: string;
  license: PlanId;
  disabled: boolean;
  role: string;
}

export interface Entitlement {
  organizationId: string;
  org: OrgBilling;
  mode: CatalogMode;
  /** Licencia efectiva: la de la persona o la del dueño del canal (en legacy, el plan de la organización). */
  license: PlanId;
  /** Persona cuya licencia cuenta (quien pide, dueño del canal). null = canal sin dueño. */
  holder: Holder | null;
}

const CACHE_MS = 15_000;
const userCache = new Map<string, { value: (Holder & { organizationId: string }) | null; at: number }>();
const channelCache = new Map<string, { value: { organizationId: string; owner: Holder | null } | null; at: number }>();

const holderSelect = { id: true, license: true, disabledAt: true, role: true, organizationId: true } as const;
type HolderRow = { id: string; license: PlanId; disabledAt: Date | null; role: string; organizationId: string };
const toHolder = (u: HolderRow): Holder => ({ id: u.id, license: u.license, disabled: !!u.disabledAt, role: u.role });

function channelKey(ref: ChannelRef): string | null {
  return ref.waAccountId ? `wa:${ref.waAccountId}` : ref.channelAccountId ? `ch:${ref.channelAccountId}` : null;
}

/** Tras cambiar la licencia, el rol o la baja de una persona (en este proceso; en otros, ≤ 15 s). */
export function invalidateUserEntitlement(userId: string) {
  userCache.delete(userId);
  channelCache.clear();
}

/** Tras cambiar el dueño de un canal. */
export function invalidateChannelEntitlement(ref: ChannelRef) {
  const key = channelKey(ref);
  if (key) channelCache.delete(key);
}

async function loadUser(userId: string) {
  const hit = userCache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const row = await prisma.user.findUnique({ where: { id: userId }, select: holderSelect });
  const value = row ? { ...toHolder(row), organizationId: row.organizationId } : null;
  userCache.set(userId, { value, at: Date.now() });
  return value;
}

async function loadChannel(ref: ChannelRef) {
  const key = channelKey(ref);
  if (!key) return null;
  const hit = channelCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const select = { organizationId: true, owner: { select: holderSelect } } as const;
  const row = ref.waAccountId
    ? await prisma.wAAccount.findUnique({ where: { id: ref.waAccountId }, select })
    : await prisma.channelAccount.findUnique({ where: { id: ref.channelAccountId! }, select });
  // Un dueño de otra organización no cuenta (no debería pasar; defensa).
  const owner = row?.owner && row.owner.organizationId === row.organizationId ? toHolder(row.owner) : null;
  const value = row ? { organizationId: row.organizationId, owner } : null;
  channelCache.set(key, { value, at: Date.now() });
  return value;
}

function resolve(org: OrgBilling, holder: Holder | null, fallback: PlanId): Entitlement {
  const mode = catalogMode(org, new Date());
  const license = mode === "internal" ? "PRO" : mode === "legacy" ? org.plan : fallback;
  return { organizationId: org.id, org, mode, license, holder };
}

/** Licencia de una persona. Desactivada = Básico (ya no paga licencia). */
export async function userEntitlement(userId: string): Promise<Entitlement | null> {
  const user = await loadUser(userId);
  if (!user) return null;
  const org = await getOrgBilling(user.organizationId);
  if (!org) return null;
  return resolve(org, user, user.disabled ? "ESSENTIAL" : user.license);
}

/** Licencia con la que funciona un canal: la de su dueño (decisión 3: sin dueño activo, Básico). */
export async function channelEntitlement(ref: ChannelRef): Promise<Entitlement | null> {
  const ch = await loadChannel(ref);
  if (!ch) return null;
  const org = await getOrgBilling(ch.organizationId);
  if (!org) return null;
  return resolve(org, ch.owner, channelLicense(ch.owner ? { license: ch.owner.license, disabled: ch.owner.disabled } : null));
}

export function entitlementHas(e: Entitlement, feature: LicenseFeature): boolean {
  if (e.mode === "internal") return true;
  if (e.mode === "legacy") return legacyHasFeature(planLimits(e.org), feature);
  return hasFeature(e.license, feature);
}

/**
 * Integraciones (regla 5): además de la función, en el catálogo nuevo su dueño
 * tiene que ser admin activo. En legacy siguen las reglas de antes (las de
 * cada integración: el fanout ya exige admin).
 */
export function integrationAllowed(e: Entitlement, feature: LicenseFeature): boolean {
  if (e.mode !== "license") return entitlementHas(e, feature);
  return !!e.holder && !e.holder.disabled && e.holder.role === "admin" && hasFeature(e.license, feature);
}

export async function userHasFeature(userId: string, feature: LicenseFeature): Promise<boolean> {
  const e = await userEntitlement(userId);
  return !!e && entitlementHas(e, feature);
}

export async function channelHasFeature(ref: ChannelRef, feature: LicenseFeature): Promise<boolean> {
  const e = await channelEntitlement(ref);
  return !!e && entitlementHas(e, feature);
}

export async function integrationOwnerHas(userId: string, feature: LicenseFeature): Promise<boolean> {
  const e = await userEntitlement(userId);
  return !!e && integrationAllowed(e, feature);
}

// ── Respuestas 402 ──

const planName = (id: PlanId) => PLANS[id].name;

function blocked(feature: LicenseFeature, message: string, actionUrl: string) {
  return NextResponse.json({ error: message, code: "plan_limit", limit: feature, actionUrl }, { status: 402 });
}

function messageFor(e: Entitlement, feature: LicenseFeature, scope: "user" | "channel" | "integration"): string {
  if (e.mode === "legacy") return featureBlockedMessage({ feature, license: e.org.plan, scope: "legacy", planName });
  return featureBlockedMessage({ feature, license: e.license, scope, ownerless: scope === "channel" && (!e.holder || e.holder.disabled), planName });
}

/** 402 si la licencia de quien pide no incluye la función; null si puede. */
export async function checkUserFeature(userId: string, feature: LicenseFeature): Promise<NextResponse | null> {
  const e = await userEntitlement(userId);
  if (!e) return blocked(feature, "Usuario no encontrado", USERS_PATH);
  if (entitlementHas(e, feature)) return null;
  return blocked(feature, messageFor(e, feature, "user"), e.mode === "legacy" ? BILLING_PLAN_PATH : USERS_PATH);
}

/** 402 si el canal (por la licencia de su dueño) no incluye la función. */
export async function checkChannelFeature(ref: ChannelRef, feature: LicenseFeature): Promise<NextResponse | null> {
  const e = await channelEntitlement(ref);
  if (!e) return blocked(feature, "Canal no encontrado", BILLING_PLAN_PATH);
  if (entitlementHas(e, feature)) return null;
  return blocked(feature, messageFor(e, feature, "channel"), e.mode === "legacy" ? BILLING_PLAN_PATH : USERS_PATH);
}

/** 402 si quien crea la integración no es admin con una licencia que la incluya. */
export async function checkIntegrationFeature(userId: string, feature: LicenseFeature): Promise<NextResponse | null> {
  const e = await userEntitlement(userId);
  if (!e) return blocked(feature, "Usuario no encontrado", USERS_PATH);
  if (integrationAllowed(e, feature)) return null;
  return blocked(feature, messageFor(e, feature, "integration"), e.mode === "legacy" ? BILLING_PLAN_PATH : USERS_PATH);
}

/** Mensaje (sin respuesta HTTP) para workers y servicios que lanzan errores propios. */
export async function channelFeatureMessage(ref: ChannelRef, feature: LicenseFeature): Promise<string | null> {
  const e = await channelEntitlement(ref);
  if (!e) return "Canal no encontrado";
  return entitlementHas(e, feature) ? null : messageFor(e, feature, "channel");
}

export async function userFeatureMessage(userId: string, feature: LicenseFeature): Promise<string | null> {
  const e = await userEntitlement(userId);
  if (!e) return "Usuario no encontrado";
  return entitlementHas(e, feature) ? null : messageFor(e, feature, "user");
}

export async function integrationFeatureMessage(userId: string, feature: LicenseFeature): Promise<string | null> {
  const e = await userEntitlement(userId);
  if (!e) return "Usuario no encontrado";
  return integrationAllowed(e, feature) ? null : messageFor(e, feature, "integration");
}

/**
 * ¿Alguna persona activa de la organización tiene la función? Para decidir si
 * una pantalla de configuración se muestra (p. ej. Bots IA: un admin Básico
 * configura el bot del canal de un Pro — regla 7). Las rutas deciden aparte.
 */
export async function orgHasAnyFeature(organizationId: string, feature: LicenseFeature): Promise<boolean> {
  const org = await getOrgBilling(organizationId);
  if (!org) return false;
  const mode = catalogMode(org, new Date());
  if (mode === "internal") return true;
  if (mode === "legacy") return legacyHasFeature(planLimits(org), feature);
  const licenses = await prisma.user.findMany({ where: { organizationId, disabledAt: null }, select: { license: true }, distinct: ["license"] });
  return licenses.some((u) => hasFeature(u.license, feature));
}
