import type { PlanId } from "@prisma/client";
import type { PlanLimits } from "./plans";

// Catálogo de LICENCIAS por usuario (docs/PLAN_LICENCIAS_2026-11-04.md).
// Cada persona de la organización paga una licencia de un plan, y una
// organización mezcla licencias de distintos planes. El precio sube por
// funciones, no por cupos: toda licencia trae un canal de cada tipo.
//
// Funciones puras y sin imports de valores (solo `import type`), igual que
// plans.ts: lo leen el servidor, la UI y, en la Fase 4, el generador de cPanel.
// Nombres y precios siguen en plans.ts (PLANS[id].name / pricePerSeatMxn).
//
// Los candados del servidor (entitlements.ts) leen este catálogo, salvo en las
// organizaciones internas y en las que conservan el catálogo anterior
// (`legacyUntil`), que siguen con plans.ts vía legacyHasFeature().

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

/** Cómo se nombra cada función en los mensajes ("no incluye …"). */
export const LICENSE_FEATURE_LABELS: Record<LicenseFeature, string> = {
  automations: "automatizaciones ni secuencias",
  macros: "macros",
  campaigns: "difusiones de WhatsApp",
  leadSources: "fuentes de leads",
  autoAssign: "asignación automática",
  csat: "encuestas de satisfacción",
  aiAssist: "asistente de IA",
  aiAgent: "agentes de IA",
  leadScoring: "calificación de leads",
  topicMonitors: "monitores de temas",
  leadRecovery: "recuperación de leads",
  api: "la API",
  webhooks: "webhooks",
  metaAds: "conversiones de Meta Ads",
  calls: "llamadas de WhatsApp",
};

/**
 * Equivalencia con el catálogo anterior (plans.ts) para las organizaciones
 * que lo conservan durante la gracia (`legacyUntil`) y las internas: lo que
 * aquel catálogo no capaba sigue encendido.
 */
export function legacyHasFeature(limits: PlanLimits, feature: LicenseFeature): boolean {
  switch (feature) {
    case "automations":
      return limits.activeAutomations > 0;
    case "campaigns":
      return limits.campaigns;
    case "aiAssist":
    case "topicMonitors":
      return limits.aiAccess;
    case "aiAgent":
    case "leadRecovery":
      return limits.bots;
    case "leadScoring":
      return limits.leadScoring;
    case "api":
      return limits.apiAccess;
    case "webhooks":
      return limits.webhooks;
    case "macros":
    case "leadSources":
    case "autoAssign":
    case "csat":
    case "metaAds":
    case "calls":
      return true;
  }
}

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

/**
 * Qué catálogo rige a una organización: "internal" (sin topes), "legacy"
 * (plans.ts a nivel organización, con la bolsa de créditos compartida) o
 * "license" (licencia por persona y plan del dueño de cada canal).
 */
export type CatalogMode = "internal" | "legacy" | "license";

export function catalogMode(org: { isInternal: boolean; legacyUntil: Date | null }, now: Date): CatalogMode {
  if (org.isInternal) return "internal";
  return isLegacyActive(org, now) ? "legacy" : "license";
}

// ── Mensajes de candado ──

/**
 * Texto del 402 cuando una función no está en la licencia. `scope` dice de
 * quién es la licencia: la persona que lo pide ("user"), el dueño del canal
 * ("channel") o el dueño de una integración ("integration": admin Pro).
 */
export function featureBlockedMessage(input: {
  feature: LicenseFeature;
  license: PlanId;
  scope: "user" | "channel" | "integration" | "legacy";
  ownerless?: boolean;
  planName: (id: PlanId) => string;
}): string {
  const label = LICENSE_FEATURE_LABELS[input.feature];
  const from = input.planName(minLicenseFor(input.feature));
  const current = input.planName(input.license);
  switch (input.scope) {
    // Catálogo anterior: el plan es de la organización.
    case "legacy":
      return `Tu plan ${current} no incluye ${label}. Mejora tu plan en Configuración → Plan y facturación.`;
    case "user":
      return `Tu licencia ${current} no incluye ${label}; está disponible desde ${from}. Un admin puede cambiar tu licencia en Usuarios.`;
    case "channel":
      return input.ownerless
        ? `Este canal no tiene dueño con licencia activa y funciona como ${current}, que no incluye ${label}. Asígnale un dueño con licencia ${from} o superior.`
        : `Este canal funciona con la licencia ${current} de su dueño, que no incluye ${label}; está disponible desde ${from}.`;
    case "integration":
      return `Solo un admin con licencia ${from} puede usar ${label}. Tu licencia es ${current}.`;
  }
}

// ── Comprar y asignar (Fase 3) ──

/**
 * Lo que impide pasar la suscripción a `target`: nunca menos licencias de un
 * plan que las asignadas (personas activas + invitaciones pendientes) y al
 * menos una en total.
 */
export function licenseTargetBlockers(target: LicenseCounts, assigned: LicenseCounts, planName: (id: PlanId) => string): string[] {
  const blockers: string[] = [];
  if (totalLicenses(target) < 1) blockers.push("Elige al menos una licencia.");
  for (const id of LICENSE_ORDER) {
    const want = Math.max(0, Math.floor(target[id] || 0));
    const used = Math.max(0, Math.floor(assigned[id] || 0));
    if (want < used) {
      blockers.push(`Tienes ${plural(used, `persona con licencia ${planName(id)}`, `personas con licencia ${planName(id)}`)} (o invitaciones pendientes): no puedes contratar menos. Cambia primero su licencia en Usuarios.`);
    }
  }
  return blockers;
}

/**
 * ¿Se puede dar una licencia de `license` a una persona más (invitarla,
 * crearla, reactivarla o cambiarle la licencia)? null = sí; si no, el motivo.
 * En la prueba sin suscripción cualquier licencia vale hasta TRIAL_MAX_USERS
 * personas; con suscripción, tiene que haber una libre de ese plan.
 */
export function licenseAssignBlocker(input: {
  license: PlanId;
  trialing: boolean;
  hasSubscription: boolean;
  isInternal: boolean;
  purchased: LicenseCounts;
  assigned: LicenseCounts;
  planName: (id: PlanId) => string;
}): string | null {
  if (input.isInternal) return null;
  if (input.trialing && !input.hasSubscription) {
    return totalLicenses(input.assigned) + 1 <= TRIAL_MAX_USERS
      ? null
      : `La prueba gratis incluye hasta ${TRIAL_MAX_USERS} personas (las invitaciones pendientes cuentan). Contrata licencias en Configuración → Plan y facturación para sumar más.`;
  }
  const { free } = licenseAvailability(input.purchased, input.assigned);
  if (free[input.license] >= 1) return null;
  const name = input.planName(input.license);
  return `No tienes licencias ${name} libres (${fmt(Math.floor(input.purchased[input.license] || 0))} contratadas, todas asignadas). Agrega una en Configuración → Plan y facturación.`;
}

/**
 * Licencias a contratar después de cambiar la licencia de una persona de
 * `from` a `to` ajustando la factura: si no hay una `to` libre se compra una,
 * y la `from` que queda libre se deja de pagar. null = no hay que tocar Stripe.
 */
export function purchasedAfterLicenseChange(purchased: LicenseCounts, assigned: LicenseCounts, from: PlanId, to: PlanId): LicenseCounts | null {
  if (from === to) return null;
  const next: LicenseCounts = { ...purchased };
  const { free } = licenseAvailability(purchased, assigned);
  if (free[to] < 1) next[to] = Math.floor(purchased[to] || 0) + 1;
  // Tras el cambio, `from` tiene una asignada menos: sobra una pagada.
  if (Math.floor(purchased[from] || 0) > Math.max(0, Math.floor(assigned[from] || 0) - 1)) next[from] = Math.floor(purchased[from] || 0) - 1;
  const same = LICENSE_ORDER.every((id) => next[id] === purchased[id]);
  return same ? null : next;
}

/** Nombre positivo de cada función (listas de "incluye"). */
export const LICENSE_FEATURE_NAMES: Record<LicenseFeature, string> = {
  automations: "Automatizaciones y secuencias",
  macros: "Macros",
  campaigns: "Difusiones de WhatsApp",
  leadSources: "Fuentes de leads",
  autoAssign: "Asignación automática",
  csat: "Encuestas de satisfacción (CSAT)",
  aiAssist: "Asistente de IA: sugerencias, resúmenes, reescritura y transcripción",
  aiAgent: "Agente de IA (bot) en sus canales",
  leadScoring: "Calificación de leads con IA",
  topicMonitors: "Monitores de temas",
  leadRecovery: "Recuperación de leads con IA",
  api: "API",
  webhooks: "Webhooks",
  metaAds: "Conversiones de Meta Ads",
  calls: "Llamadas de WhatsApp",
};

/** Lo que una licencia agrega sobre la anterior ("Todo lo de Avanzado, más…"). */
export function licenseAddedFeatures(id: PlanId): LicenseFeature[] {
  const i = licenseRank(id);
  const below = i > 0 ? LICENSES[LICENSE_ORDER[i - 1]].features : new Set<LicenseFeature>();
  return LICENSE_FEATURES.filter((f) => LICENSES[id].features.has(f) && !below.has(f));
}
