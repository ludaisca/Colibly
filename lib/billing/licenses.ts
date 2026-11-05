import type { PlanId } from "@prisma/client";

// Catálogo de LICENCIAS por usuario (docs/PLAN_LICENCIAS_2026-11-04.md).
// Cada persona de la organización paga una licencia de un plan, y una
// organización mezcla licencias de distintos planes. El precio sube por
// funciones, no por cupos: toda licencia trae un canal de cada tipo.
//
// Funciones puras y sin imports de valores (solo `import type`), igual que
// plans.ts: lo leen el servidor, la UI y, en la Fase 4, el generador de cPanel.
// Nombres y precios siguen en plans.ts (PLANS[id].name / pricePerSeatMxn).
//
// Fase 1: este catálogo existe y está probado, pero los candados todavía leen
// plans.ts. La Fase 2 conecta gates.ts aquí.

export const LICENSE_ORDER: readonly PlanId[] = ["ESSENTIAL", "BUSINESS", "PRO"];

/** Funciones que se encienden por licencia. */
export type LicenseFeature =
  // Avanzado
  | "automations" // automatizaciones y secuencias
  | "macros"
  | "campaigns" // difusiones de WhatsApp
  | "leadSources" // fuentes de leads (hojas, formularios)
  | "autoAssign"
  | "csat"
  | "aiAssist" // sugerencias, resúmenes, reescritura, transcripción
  | "aiAgent" // bot que responde solo en el canal
  // Pro
  | "leadScoring"
  | "topicMonitors"
  | "leadRecovery"
  | "api"
  | "webhooks"
  | "metaAds" // conversiones de Meta Ads (CAPI)
  | "calls"; // llamadas de WhatsApp

export const LICENSE_FEATURES: readonly LicenseFeature[] = [
  "automations",
  "macros",
  "campaigns",
  "leadSources",
  "autoAssign",
  "csat",
  "aiAssist",
  "aiAgent",
  "leadScoring",
  "topicMonitors",
  "leadRecovery",
  "api",
  "webhooks",
  "metaAds",
  "calls",
];

const BUSINESS_FEATURES: readonly LicenseFeature[] = ["automations", "macros", "campaigns", "leadSources", "autoAssign", "csat", "aiAssist", "aiAgent"];
const PRO_FEATURES: readonly LicenseFeature[] = [...BUSINESS_FEATURES, "leadScoring", "topicMonitors", "leadRecovery", "api", "webhooks", "metaAds", "calls"];

/** Canales: cada licencia ocupa como máximo uno de cada tipo. */
export type LicenseChannel = "whatsapp" | "instagram" | "messenger" | "telegram" | "webchat";
export const LICENSE_CHANNELS: readonly LicenseChannel[] = ["whatsapp", "instagram", "messenger", "telegram", "webchat"];
export const CHANNELS_PER_LICENSE = 1;

export interface LicenseTier {
  id: PlanId;
  features: ReadonlySet<LicenseFeature>;
  // Se suman en la organización (una persona no tiene contactos propios).
  contacts: number;
  activeLeads: number;
  // Personales: cada quien gasta los suyos, sin bolsa.
  aiCreditsPerMonth: number;
  // De la organización: valen los de la licencia más alta que tenga.
  funnels: number;
  customFields: number;
}

export const LICENSES: Record<PlanId, LicenseTier> = {
  ESSENTIAL: {
    id: "ESSENTIAL",
    features: new Set(),
    contacts: 2_000,
    activeLeads: 500,
    aiCreditsPerMonth: 0,
    funnels: 1,
    customFields: 10,
  },
  BUSINESS: {
    id: "BUSINESS",
    features: new Set(BUSINESS_FEATURES),
    contacts: 5_000,
    activeLeads: 1_500,
    aiCreditsPerMonth: 1_000,
    funnels: 5,
    customFields: 50,
  },
  PRO: {
    id: "PRO",
    features: new Set(PRO_FEATURES),
    contacts: 10_000,
    activeLeads: 3_000,
    aiCreditsPerMonth: 2_500,
    funnels: Infinity,
    customFields: 400,
  },
};

// Prueba gratis (decisión 1 del plan): hasta 3 personas, todas con licencia
// Pro, y 500 créditos de IA por persona en lugar de los del plan.
export const TRIAL_LICENSE: PlanId = "PRO";
export const TRIAL_MAX_USERS = 3;
export const TRIAL_AI_CREDITS_PER_USER = 500;

// Canal sin dueño válido (decisión 3): funciona como Básico hasta que se le
// asigne uno.
export const OWNERLESS_CHANNEL_LICENSE: PlanId = "ESSENTIAL";

export function licenseRank(id: PlanId): number {
  return LICENSE_ORDER.indexOf(id);
}

export function hasFeature(license: PlanId, feature: LicenseFeature): boolean {
  return LICENSES[license].features.has(feature);
}

/** La licencia más barata que incluye la función ("Disponible desde Avanzado"). */
export function minLicenseFor(feature: LicenseFeature): PlanId {
  const id = LICENSE_ORDER.find((l) => hasFeature(l, feature));
  if (!id) throw new Error(`Ninguna licencia incluye ${feature}`);
  return id;
}

export function highestLicense(licenses: readonly PlanId[]): PlanId | null {
  let best: PlanId | null = null;
  for (const l of licenses) if (best === null || licenseRank(l) > licenseRank(best)) best = l;
  return best;
}

/** Licencias por plan: lo que se compra (líneas de Stripe) o lo que está asignado. */
export type LicenseCounts = Record<PlanId, number>;

export const EMPTY_LICENSE_COUNTS: LicenseCounts = { ESSENTIAL: 0, BUSINESS: 0, PRO: 0 };

export function countLicenses(licenses: readonly PlanId[]): LicenseCounts {
  const out: LicenseCounts = { ...EMPTY_LICENSE_COUNTS };
  for (const l of licenses) out[l] += 1;
  return out;
}

export function totalLicenses(counts: LicenseCounts): number {
  return LICENSE_ORDER.reduce((n, id) => n + Math.max(0, Math.floor(counts[id] || 0)), 0);
}

// ── Plan del canal ──

/**
 * Plan con el que funciona un canal: el de su dueño. Sin dueño (o con un
 * dueño desactivado, que ya no paga licencia) se trata como Básico.
 */
export function channelLicense(owner: { license: PlanId; disabled: boolean } | null): PlanId {
  if (!owner || owner.disabled) return OWNERLESS_CHANNEL_LICENSE;
  return owner.license;
}

/**
 * ¿Puede esta persona ser dueña de otro canal de `channel`? Una licencia ocupa
 * uno de cada tipo; `owned` son los canales de los que ya es dueña (sin contar
 * el que se está reasignando, si es suyo).
 */
export function canOwnChannel(owned: readonly LicenseChannel[], channel: LicenseChannel): boolean {
  return owned.filter((c) => c === channel).length < CHANNELS_PER_LICENSE;
}

// ── Límites de la organización ──

export interface OrgLicenseLimits {
  users: number;
  contacts: number;
  activeLeads: number;
  funnels: number;
  customFields: number;
  // Canales de cada tipo que caben (uno por licencia).
  channelsPerType: number;
}

export const UNLIMITED_ORG_LICENSE_LIMITS: OrgLicenseLimits = {
  users: Infinity,
  contacts: Infinity,
  activeLeads: Infinity,
  funnels: Infinity,
  customFields: Infinity,
  channelsPerType: Infinity,
};

/**
 * Contactos y leads activos: la suma de las licencias. Embudos y campos
 * personalizados son de la organización: los de su licencia más alta
 * (decisión 2). Sin licencias, el mínimo de Básico para que nada quede en 0.
 */
export function orgLicenseLimits(counts: LicenseCounts): OrgLicenseLimits {
  const total = totalLicenses(counts);
  const held = LICENSE_ORDER.filter((id) => (counts[id] || 0) > 0);
  const top = LICENSES[highestLicense(held) ?? "ESSENTIAL"];
  const sum = (pick: (t: LicenseTier) => number) =>
    total === 0 ? pick(LICENSES.ESSENTIAL) : LICENSE_ORDER.reduce((n, id) => n + pick(LICENSES[id]) * Math.max(0, Math.floor(counts[id] || 0)), 0);
  return {
    users: total,
    contacts: sum((t) => t.contacts),
    activeLeads: sum((t) => t.activeLeads),
    funnels: top.funnels,
    customFields: top.customFields,
    channelsPerType: total * CHANNELS_PER_LICENSE,
  };
}

// ── Créditos de IA personales ──

/**
 * Tope de créditos de una persona en el periodo: los de su licencia (en la
 * prueba, TRIAL_AI_CREDITS_PER_USER) más el bono de la plataforma. Una
 * licencia sin asistente de IA queda en 0: ni el bono la habilita.
 */
export function userAiCreditLimit(input: { license: PlanId; bonus: number; trialing: boolean; isInternal?: boolean }): number {
  if (input.isInternal) return Infinity;
  if (!hasFeature(input.license, "aiAssist")) return 0;
  const base = input.trialing ? TRIAL_AI_CREDITS_PER_USER : LICENSES[input.license].aiCreditsPerMonth;
  return base + Math.max(0, Math.floor(input.bonus || 0));
}

// ── Asignar licencias ──

/**
 * Licencias libres de cada plan: compradas menos las ocupadas (personas
 * activas + invitaciones pendientes). Nunca negativo: si sobran ocupadas, la
 * pantalla lo muestra como excedente (`overAssigned`).
 */
export function licenseAvailability(purchased: LicenseCounts, assigned: LicenseCounts): { free: LicenseCounts; overAssigned: LicenseCounts } {
  const free: LicenseCounts = { ...EMPTY_LICENSE_COUNTS };
  const overAssigned: LicenseCounts = { ...EMPTY_LICENSE_COUNTS };
  for (const id of LICENSE_ORDER) {
    const diff = Math.max(0, Math.floor(purchased[id] || 0)) - Math.max(0, Math.floor(assigned[id] || 0));
    free[id] = Math.max(0, diff);
    overAssigned[id] = Math.max(0, -diff);
  }
  return { free, overAssigned };
}

export interface LicenseUsage {
  // Lo que la persona tiene encendido y depende de su licencia.
  ownedChannelsWithBot: number; // canales suyos con un agente de IA activo
  activeAutomations: number; // creadas por ella, activas
  scheduledCampaigns: number; // programadas o en curso en sus canales
  activeScorers: number;
  activeMonitors: number;
  leadRecoveryOn: boolean; // en alguno de sus canales
  apiKeys: number; // activas, creadas por ella
  webhooks: number; // activos, creados por ella
  metaAdsAccounts: number;
}

export interface LicenseChangeImpact {
  blockers: string[];
  // Lo que se apaga: el cambio procede si el admin confirma.
  warnings: string[];
}

const fmt = (n: number) => n.toLocaleString("es-MX");
const plural = (n: number, one: string, many: string) => `${fmt(n)} ${n === 1 ? one : many}`;

/**
 * Qué pasa al cambiar la licencia de una persona de `from` a `to`. Subir
 * nunca apaga nada. Bajar avisa de lo que deja de funcionar (la configuración
 * se conserva y se pausa). Bloquea solo si no hay una licencia libre del plan
 * destino (`freeOfTarget`): la Fase 3 la compra en el mismo paso.
 */
export function licenseChangeImpact(input: { from: PlanId; to: PlanId; freeOfTarget: number; usage: LicenseUsage; planName: (id: PlanId) => string }): LicenseChangeImpact {
  const { from, to, usage } = input;
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (from === to) return { blockers, warnings };
  const name = input.planName(to);
  if (input.freeOfTarget <= 0) {
    blockers.push(`No hay licencias ${name} libres. Agrega una en Configuración → Plan y facturación.`);
  }
  const loses = (f: LicenseFeature) => hasFeature(from, f) && !hasFeature(to, f);
  if (loses("aiAgent") && usage.ownedChannelsWithBot > 0) {
    warnings.push(`${name} no incluye agentes de IA: el bot de ${plural(usage.ownedChannelsWithBot, "su canal", "sus canales")} dejará de responder solo.`);
  }
  if (loses("aiAssist")) warnings.push(`${name} no incluye IA: perderá las sugerencias, los resúmenes y sus créditos de IA.`);
  if (loses("automations") && usage.activeAutomations > 0) {
    warnings.push(`${name} no incluye automatizaciones: se pausarán ${plural(usage.activeAutomations, "automatización suya", "automatizaciones suyas")}.`);
  }
  if (loses("campaigns") && usage.scheduledCampaigns > 0) {
    warnings.push(`${name} no incluye difusiones: se pausarán ${plural(usage.scheduledCampaigns, "difusión programada", "difusiones programadas")} en sus canales.`);
  }
  if (loses("leadScoring") && usage.activeScorers > 0) {
    warnings.push(`${name} no incluye calificación de leads: ${plural(usage.activeScorers, "calificador dejará", "calificadores dejarán")} de correr.`);
  }
  if (loses("topicMonitors") && usage.activeMonitors > 0) {
    warnings.push(`${name} no incluye monitores de temas: ${plural(usage.activeMonitors, "monitor suyo se pausará", "monitores suyos se pausarán")}.`);
  }
  if (loses("leadRecovery") && usage.leadRecoveryOn) warnings.push(`${name} no incluye recuperación de leads: se apagará en sus canales.`);
  if (loses("api") && usage.apiKeys > 0) warnings.push(`${name} no incluye la API: ${plural(usage.apiKeys, "clave de API suya dejará", "claves de API suyas dejarán")} de funcionar.`);
  if (loses("webhooks") && usage.webhooks > 0) warnings.push(`${name} no incluye webhooks: se pausarán ${plural(usage.webhooks, "webhook suyo", "webhooks suyos")}.`);
  if (loses("metaAds") && usage.metaAdsAccounts > 0) warnings.push(`${name} no incluye Meta Ads: se dejarán de enviar conversiones.`);
  return { blockers, warnings };
}

// ── Precio ──

export function monthlyTotalForLicenses(counts: LicenseCounts, pricePerLicense: (id: PlanId) => number): number {
  return LICENSE_ORDER.reduce((n, id) => n + pricePerLicense(id) * Math.max(0, Math.floor(counts[id] || 0)), 0);
}

// ── Clientes del catálogo anterior (decisión 4) ──

export const LEGACY_GRACE_DAYS = 60;

/** Mientras sea true, la organización conserva lo que tenía con el catálogo anterior. */
export function isLegacyActive(org: { legacyUntil: Date | null }, now: Date): boolean {
  return !!org.legacyUntil && org.legacyUntil > now;
}
