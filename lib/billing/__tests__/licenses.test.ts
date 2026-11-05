import { describe, expect, it } from "vitest";
import {
  canOwnChannel,
  catalogMode,
  channelLicense,
  countLicenses,
  EMPTY_LICENSE_COUNTS,
  featureBlockedMessage,
  hasFeature,
  highestLicense,
  isLegacyActive,
  legacyHasFeature,
  LICENSE_FEATURE_LABELS,
  LICENSE_FEATURES,
  LICENSE_ORDER,
  LICENSES,
  licenseAssignBlocker,
  licenseAvailability,
  licenseChangeImpact,
  licenseTargetBlockers,
  purchasedAfterLicenseChange,
  minLicenseFor,
  monthlyTotalForLicenses,
  orgLicenseLimits,
  TRIAL_AI_CREDITS_PER_USER,
  userAiCreditLimit,
  type LicenseUsage,
} from "../licenses";
import { limitsForSeats, PLANS } from "../plans";
import type { PlanId } from "@prisma/client";

const NO_USAGE: LicenseUsage = {
  ownedChannelsWithBot: 0,
  activeAutomations: 0,
  scheduledCampaigns: 0,
  activeScorers: 0,
  activeMonitors: 0,
  leadRecoveryOn: false,
  apiKeys: 0,
  webhooks: 0,
  metaAdsAccounts: 0,
};
const planName = (id: PlanId) => PLANS[id].name;

describe("catálogo de licencias", () => {
  it("cada plan incluye todo lo del anterior (el precio sube por funciones)", () => {
    for (let i = 1; i < LICENSE_ORDER.length; i++) {
      const lower = LICENSES[LICENSE_ORDER[i - 1]];
      const upper = LICENSES[LICENSE_ORDER[i]];
      for (const f of lower.features) expect(upper.features.has(f)).toBe(true);
      expect(upper.features.size).toBeGreaterThan(lower.features.size);
      expect(upper.contacts).toBeGreaterThan(lower.contacts);
      expect(upper.aiCreditsPerMonth).toBeGreaterThan(lower.aiCreditsPerMonth);
    }
  });

  it("Básico: sin IA ni API; Pro: todas las funciones", () => {
    expect(hasFeature("ESSENTIAL", "aiAssist")).toBe(false);
    expect(hasFeature("ESSENTIAL", "aiAgent")).toBe(false);
    expect(hasFeature("ESSENTIAL", "api")).toBe(false);
    expect(LICENSES.ESSENTIAL.aiCreditsPerMonth).toBe(0);
    for (const f of LICENSE_FEATURES) expect(hasFeature("PRO", f)).toBe(true);
  });

  it("Avanzado tiene IA y automatizaciones, pero no API, webhooks ni calificación", () => {
    for (const f of ["aiAssist", "aiAgent", "automations", "campaigns", "macros", "autoAssign", "csat"] as const) expect(hasFeature("BUSINESS", f)).toBe(true);
    for (const f of ["api", "webhooks", "leadScoring", "topicMonitors", "leadRecovery", "metaAds", "calls"] as const) expect(hasFeature("BUSINESS", f)).toBe(false);
  });

  it("minLicenseFor dice desde qué plan está cada función", () => {
    expect(minLicenseFor("aiAgent")).toBe("BUSINESS");
    expect(minLicenseFor("api")).toBe("PRO");
    expect(minLicenseFor("campaigns")).toBe("BUSINESS");
  });

  it("los cupos son los acordados (2026-11-04)", () => {
    expect([LICENSES.ESSENTIAL.contacts, LICENSES.BUSINESS.contacts, LICENSES.PRO.contacts]).toEqual([2_000, 5_000, 10_000]);
    expect([LICENSES.ESSENTIAL.activeLeads, LICENSES.BUSINESS.activeLeads, LICENSES.PRO.activeLeads]).toEqual([500, 1_500, 3_000]);
    expect([LICENSES.ESSENTIAL.aiCreditsPerMonth, LICENSES.BUSINESS.aiCreditsPerMonth, LICENSES.PRO.aiCreditsPerMonth]).toEqual([0, 1_000, 2_500]);
  });

  it("los ids coinciden con PLANS (nombre y precio salen de ahí)", () => {
    expect([...LICENSE_ORDER]).toEqual(["ESSENTIAL", "BUSINESS", "PRO"]);
    for (const id of LICENSE_ORDER) expect(PLANS[id].id).toBe(id);
  });
});

describe("highestLicense / countLicenses", () => {
  it("elige la más alta y cuenta por plan", () => {
    expect(highestLicense(["ESSENTIAL", "PRO", "BUSINESS"])).toBe("PRO");
    expect(highestLicense([])).toBeNull();
    expect(countLicenses(["PRO", "ESSENTIAL", "PRO"])).toEqual({ ESSENTIAL: 1, BUSINESS: 0, PRO: 2 });
  });
});

describe("orgLicenseLimits", () => {
  it("10 Básico: contactos y leads se suman; embudos y campos son los de Básico", () => {
    const l = orgLicenseLimits({ ESSENTIAL: 10, BUSINESS: 0, PRO: 0 });
    expect(l).toMatchObject({ users: 10, contacts: 20_000, activeLeads: 5_000, funnels: 1, customFields: 10, channelsPerType: 10 });
  });

  it("mezcla: se suman por plan y embudos/campos los da la licencia más alta", () => {
    const l = orgLicenseLimits({ ESSENTIAL: 3, BUSINESS: 1, PRO: 1 });
    expect(l.contacts).toBe(3 * 2_000 + 5_000 + 10_000);
    expect(l.activeLeads).toBe(3 * 500 + 1_500 + 3_000);
    expect(l.funnels).toBe(Infinity);
    expect(l.customFields).toBe(400);
    expect(l.channelsPerType).toBe(5);
  });

  it("sin licencias no deja los cupos en cero", () => {
    const l = orgLicenseLimits(EMPTY_LICENSE_COUNTS);
    expect(l.users).toBe(0);
    expect(l.contacts).toBe(LICENSES.ESSENTIAL.contacts);
    expect(l.funnels).toBe(1);
  });

  it("ignora cantidades negativas o con decimales", () => {
    expect(orgLicenseLimits({ ESSENTIAL: -2, BUSINESS: 1.7, PRO: 0 }).users).toBe(1);
  });
});

describe("channelLicense", () => {
  it("el canal tiene el plan de su dueño", () => expect(channelLicense({ license: "PRO", disabled: false })).toBe("PRO"));
  it("sin dueño o con dueño desactivado: Básico", () => {
    expect(channelLicense(null)).toBe("ESSENTIAL");
    expect(channelLicense({ license: "PRO", disabled: true })).toBe("ESSENTIAL");
  });
});

describe("canOwnChannel", () => {
  it("una licencia ocupa uno de cada tipo", () => {
    expect(canOwnChannel([], "whatsapp")).toBe(true);
    expect(canOwnChannel(["whatsapp"], "whatsapp")).toBe(false);
    expect(canOwnChannel(["whatsapp", "telegram"], "instagram")).toBe(true);
    expect(canOwnChannel(["webchat"], "webchat")).toBe(false);
  });
});

describe("userAiCreditLimit", () => {
  it("cada persona tiene los de su licencia más su bono", () => {
    expect(userAiCreditLimit({ license: "BUSINESS", bonus: 0, trialing: false })).toBe(1_000);
    expect(userAiCreditLimit({ license: "PRO", bonus: 200, trialing: false })).toBe(2_700);
  });
  it("Básico: 0, aunque tenga bono", () => expect(userAiCreditLimit({ license: "ESSENTIAL", bonus: 500, trialing: false })).toBe(0));
  it("en la prueba: 500 por persona", () => expect(userAiCreditLimit({ license: "PRO", bonus: 0, trialing: true })).toBe(TRIAL_AI_CREDITS_PER_USER));
  it("organización interna: sin tope", () => expect(userAiCreditLimit({ license: "ESSENTIAL", bonus: 0, trialing: false, isInternal: true })).toBe(Infinity));
});

describe("licenseAvailability", () => {
  it("libres = compradas − ocupadas, y el excedente aparte", () => {
    const r = licenseAvailability({ ESSENTIAL: 5, BUSINESS: 1, PRO: 0 }, { ESSENTIAL: 3, BUSINESS: 1, PRO: 2 });
    expect(r.free).toEqual({ ESSENTIAL: 2, BUSINESS: 0, PRO: 0 });
    expect(r.overAssigned).toEqual({ ESSENTIAL: 0, BUSINESS: 0, PRO: 2 });
  });
});

describe("licenseChangeImpact", () => {
  it("mismo plan: nada", () => expect(licenseChangeImpact({ from: "PRO", to: "PRO", freeOfTarget: 0, usage: NO_USAGE, planName })).toEqual({ blockers: [], warnings: [] }));

  it("subir no apaga nada; solo pide una licencia libre", () => {
    expect(licenseChangeImpact({ from: "ESSENTIAL", to: "PRO", freeOfTarget: 1, usage: NO_USAGE, planName })).toEqual({ blockers: [], warnings: [] });
    expect(licenseChangeImpact({ from: "ESSENTIAL", to: "PRO", freeOfTarget: 0, usage: NO_USAGE, planName }).blockers).toHaveLength(1);
  });

  it("Pro → Avanzado avisa de API, webhooks y calificación en uso", () => {
    const r = licenseChangeImpact({ from: "PRO", to: "BUSINESS", freeOfTarget: 1, usage: { ...NO_USAGE, apiKeys: 2, webhooks: 1, activeScorers: 1, ownedChannelsWithBot: 1 }, planName });
    expect(r.blockers).toEqual([]);
    expect(r.warnings.some((w) => w.includes("API"))).toBe(true);
    expect(r.warnings.some((w) => w.includes("webhook"))).toBe(true);
    expect(r.warnings.some((w) => w.includes("calificación"))).toBe(true);
    // Avanzado conserva el bot.
    expect(r.warnings.some((w) => w.includes("agentes de IA"))).toBe(false);
  });

  it("Avanzado → Básico avisa de IA aunque no haya nada encendido", () => {
    const r = licenseChangeImpact({ from: "BUSINESS", to: "ESSENTIAL", freeOfTarget: 1, usage: NO_USAGE, planName });
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain("IA");
  });
});

describe("monthlyTotalForLicenses", () => {
  it("suma precio × cantidad por plan", () => {
    const price = (id: PlanId) => PLANS[id].pricePerSeatMxn;
    expect(monthlyTotalForLicenses({ ESSENTIAL: 10, BUSINESS: 0, PRO: 0 }, price)).toBe(590);
    expect(monthlyTotalForLicenses({ ESSENTIAL: 2, BUSINESS: 1, PRO: 1 }, price)).toBe(2 * 59 + 89 + 149);
  });
});

describe("isLegacyActive", () => {
  const now = new Date("2026-11-05T00:00:00Z");
  it("solo con fecha futura", () => {
    expect(isLegacyActive({ legacyUntil: null }, now)).toBe(false);
    expect(isLegacyActive({ legacyUntil: new Date("2026-12-01T00:00:00Z") }, now)).toBe(true);
    expect(isLegacyActive({ legacyUntil: new Date("2026-11-01T00:00:00Z") }, now)).toBe(false);
  });
});

describe("catalogMode", () => {
  const now = new Date("2026-11-05T00:00:00Z");
  it("interna > legacy vigente > licencias", () => {
    expect(catalogMode({ isInternal: true, legacyUntil: null }, now)).toBe("internal");
    expect(catalogMode({ isInternal: false, legacyUntil: new Date("2027-01-01T00:00:00Z") }, now)).toBe("legacy");
    expect(catalogMode({ isInternal: false, legacyUntil: new Date("2026-11-01T00:00:00Z") }, now)).toBe("license");
    expect(catalogMode({ isInternal: false, legacyUntil: null }, now)).toBe("license");
  });
});

describe("legacyHasFeature (catálogo anterior durante la gracia)", () => {
  const old = (id: PlanId) => limitsForSeats(PLANS[id], 1);
  it("Básico anterior conserva IA y API, sin bots, difusiones ni webhooks", () => {
    expect(legacyHasFeature(old("ESSENTIAL"), "aiAssist")).toBe(true);
    expect(legacyHasFeature(old("ESSENTIAL"), "api")).toBe(true);
    expect(legacyHasFeature(old("ESSENTIAL"), "aiAgent")).toBe(false);
    expect(legacyHasFeature(old("ESSENTIAL"), "campaigns")).toBe(false);
    expect(legacyHasFeature(old("ESSENTIAL"), "webhooks")).toBe(false);
    expect(legacyHasFeature(old("ESSENTIAL"), "automations")).toBe(false);
  });
  it("lo que el catálogo anterior no capaba sigue encendido", () => {
    for (const f of ["macros", "leadSources", "autoAssign", "csat", "metaAds", "calls"] as const) expect(legacyHasFeature(old("ESSENTIAL"), f)).toBe(true);
  });
  it("Avanzado anterior: bots y webhooks sí, calificación no; Pro anterior: todo", () => {
    expect(legacyHasFeature(old("BUSINESS"), "aiAgent")).toBe(true);
    expect(legacyHasFeature(old("BUSINESS"), "webhooks")).toBe(true);
    expect(legacyHasFeature(old("BUSINESS"), "leadScoring")).toBe(false);
    for (const f of LICENSE_FEATURES) expect(legacyHasFeature(old("PRO"), f)).toBe(true);
  });
});

describe("featureBlockedMessage", () => {
  it("por persona: su licencia, desde qué plan y quién la cambia", () => {
    const m = featureBlockedMessage({ feature: "aiAssist", license: "ESSENTIAL", scope: "user", planName });
    expect(m).toContain("Tu licencia Básico");
    expect(m).toContain("desde Avanzado");
    expect(m).toContain("Usuarios");
  });
  it("por canal: distingue el canal sin dueño", () => {
    expect(featureBlockedMessage({ feature: "aiAgent", license: "ESSENTIAL", scope: "channel", planName })).toContain("licencia Básico de su dueño");
    expect(featureBlockedMessage({ feature: "aiAgent", license: "ESSENTIAL", scope: "channel", ownerless: true, planName })).toContain("no tiene dueño");
  });
  it("integraciones: admin Pro; legacy: el plan de la organización", () => {
    expect(featureBlockedMessage({ feature: "webhooks", license: "BUSINESS", scope: "integration", planName })).toContain("admin con licencia Pro");
    expect(featureBlockedMessage({ feature: "campaigns", license: "ESSENTIAL", scope: "legacy", planName })).toContain("Tu plan Básico");
  });
  it("cada función tiene etiqueta", () => {
    for (const f of LICENSE_FEATURES) expect(LICENSE_FEATURE_LABELS[f].length).toBeGreaterThan(0);
  });
});

describe("comprar y asignar licencias", () => {
  const counts = (e: number, b: number, p: number) => ({ ESSENTIAL: e, BUSINESS: b, PRO: p });
  const base = { trialing: false, hasSubscription: true, isInternal: false, planName };

  it("no se contrata menos de lo asignado de cada plan", () => {
    expect(licenseTargetBlockers(counts(3, 1, 0), counts(3, 1, 0), planName)).toEqual([]);
    const b = licenseTargetBlockers(counts(2, 1, 0), counts(3, 1, 0), planName);
    expect(b).toHaveLength(1);
    expect(b[0]).toContain("3 personas con licencia Básico");
    expect(licenseTargetBlockers(counts(0, 0, 0), counts(0, 0, 0), planName)[0]).toContain("al menos una");
  });

  it("asignar exige una libre de ese plan", () => {
    expect(licenseAssignBlocker({ ...base, license: "ESSENTIAL", purchased: counts(3, 0, 1), assigned: counts(2, 0, 1) })).toBeNull();
    expect(licenseAssignBlocker({ ...base, license: "PRO", purchased: counts(3, 0, 1), assigned: counts(2, 0, 1) })).toContain("licencias Pro libres");
  });

  it("en la prueba sin suscripción: cualquier licencia hasta 3 personas", () => {
    const trial = { ...base, trialing: true, hasSubscription: false, purchased: counts(0, 0, 0) };
    expect(licenseAssignBlocker({ ...trial, license: "PRO", assigned: counts(0, 0, 2) })).toBeNull();
    expect(licenseAssignBlocker({ ...trial, license: "ESSENTIAL", assigned: counts(1, 0, 2) })).toContain("hasta 3 personas");
  });

  it("interna: sin tope", () => {
    expect(licenseAssignBlocker({ ...base, isInternal: true, license: "PRO", purchased: counts(0, 0, 0), assigned: counts(0, 0, 9) })).toBeNull();
  });

  it("cambiar de licencia ajustando la factura compra la nueva y suelta la vieja", () => {
    // 2 Básico pagadas y asignadas; una persona pasa a Pro.
    expect(purchasedAfterLicenseChange(counts(2, 0, 0), counts(2, 0, 0), "ESSENTIAL", "PRO")).toEqual(counts(1, 0, 1));
    // Ya había una Pro libre: solo se suelta la Básico.
    expect(purchasedAfterLicenseChange(counts(2, 0, 1), counts(2, 0, 0), "ESSENTIAL", "PRO")).toEqual(counts(1, 0, 1));
    // Sobraba una Pro libre y otra Básico libre, de Básico a Pro: suelta solo una Básico.
    expect(purchasedAfterLicenseChange(counts(3, 0, 1), counts(2, 0, 0), "ESSENTIAL", "PRO")).toEqual(counts(2, 0, 1));
    expect(purchasedAfterLicenseChange(counts(1, 0, 0), counts(1, 0, 0), "ESSENTIAL", "ESSENTIAL")).toBeNull();
  });
});
