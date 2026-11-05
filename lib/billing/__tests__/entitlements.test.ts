import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlanId } from "@prisma/client";

// Resolución de licencias (reglas 3–7 de docs/PLAN_LICENCIAS_2026-11-04.md):
// por persona, por dueño del canal y por dueño de una integración, más las
// organizaciones internas y las que conservan el catálogo anterior.

type U = { id: string; license: PlanId; disabledAt: Date | null; role: string; organizationId: string };
const db = vi.hoisted(() => ({
  org: {} as Record<string, unknown>,
  users: new Map<string, U>(),
  channels: new Map<string, { organizationId: string; ownerId: string | null }>(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => db.users.get(where.id) ?? null) },
    wAAccount: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const ch = db.channels.get(where.id);
        return ch ? { organizationId: ch.organizationId, owner: ch.ownerId ? db.users.get(ch.ownerId) ?? null : null } : null;
      }),
    },
    channelAccount: { findUnique: vi.fn(async () => null) },
    wABot: { findUnique: vi.fn(async () => null) },
  },
}));
vi.mock("../gates", () => ({
  BILLING_PLAN_PATH: "/configuracion/plan",
  USERS_PATH: "/usuarios",
  getOrgBilling: vi.fn(async () => db.org),
}));

import {
  channelHasFeature,
  checkChannelFeature,
  checkIntegrationFeature,
  checkUserFeature,
  integrationOwnerHas,
  invalidateChannelEntitlement,
  invalidateUserEntitlement,
  userHasFeature,
} from "../entitlements";

const baseOrg = { id: "org1", name: "Spa Aurora", plan: "PRO", status: "ACTIVE", isInternal: false, seatQuantity: 3, legacyUntil: null };

function user(id: string, license: PlanId, extra: Partial<U> = {}): U {
  return { id, license, disabledAt: null, role: "user", organizationId: "org1", ...extra };
}

beforeEach(() => {
  db.org = { ...baseOrg };
  db.users.clear();
  db.channels.clear();
  for (const id of ["basico", "avanzado", "pro", "admin-pro", "admin-avanzado", "baja"]) invalidateUserEntitlement(id);
  for (const id of ["wa-pro", "wa-basico", "wa-sin-dueno", "wa-baja"]) invalidateChannelEntitlement({ waAccountId: id });
  db.users.set("basico", user("basico", "ESSENTIAL"));
  db.users.set("avanzado", user("avanzado", "BUSINESS"));
  db.users.set("pro", user("pro", "PRO"));
  db.users.set("admin-pro", user("admin-pro", "PRO", { role: "admin" }));
  db.users.set("admin-avanzado", user("admin-avanzado", "BUSINESS", { role: "admin" }));
  db.users.set("baja", user("baja", "PRO", { disabledAt: new Date() }));
  db.channels.set("wa-pro", { organizationId: "org1", ownerId: "pro" });
  db.channels.set("wa-basico", { organizationId: "org1", ownerId: "basico" });
  db.channels.set("wa-sin-dueno", { organizationId: "org1", ownerId: null });
  db.channels.set("wa-baja", { organizationId: "org1", ownerId: "baja" });
});

describe("por persona (regla 4)", () => {
  it("cada quien con su licencia, aunque la organización sea Pro", async () => {
    expect(await userHasFeature("basico", "aiAssist")).toBe(false);
    expect(await userHasFeature("avanzado", "aiAssist")).toBe(true);
    expect(await userHasFeature("avanzado", "leadScoring")).toBe(false);
    expect(await userHasFeature("pro", "leadScoring")).toBe(true);
  });

  it("una persona desactivada cuenta como Básico", async () => {
    expect(await userHasFeature("baja", "aiAssist")).toBe(false);
  });

  it("el 402 dice qué licencia tiene y manda a Usuarios", async () => {
    const res = await checkUserFeature("basico", "macros");
    expect(res?.status).toBe(402);
    const body = await res!.json();
    expect(body).toMatchObject({ code: "plan_limit", limit: "macros", actionUrl: "/usuarios" });
    expect(body.error).toContain("Tu licencia Básico");
    expect(await checkUserFeature("avanzado", "macros")).toBeNull();
  });
});

describe("por canal (regla 3 y decisión 3)", () => {
  it("el canal funciona con la licencia de su dueño", async () => {
    expect(await channelHasFeature({ waAccountId: "wa-pro" }, "aiAgent")).toBe(true);
    expect(await channelHasFeature({ waAccountId: "wa-basico" }, "aiAgent")).toBe(false);
  });

  it("sin dueño o con dueño desactivado: Básico", async () => {
    expect(await channelHasFeature({ waAccountId: "wa-sin-dueno" }, "aiAgent")).toBe(false);
    expect(await channelHasFeature({ waAccountId: "wa-baja" }, "campaigns")).toBe(false);
    const body = await (await checkChannelFeature({ waAccountId: "wa-sin-dueno" }, "aiAgent"))!.json();
    expect(body.error).toContain("no tiene dueño");
  });

  it("un canal inexistente no pasa", async () => {
    expect(await channelHasFeature({ waAccountId: "nope" }, "aiAgent")).toBe(false);
  });
});

describe("integraciones (regla 5): admin activo con la función", () => {
  it("API y webhooks solo para un admin Pro", async () => {
    expect(await integrationOwnerHas("admin-pro", "api")).toBe(true);
    expect(await integrationOwnerHas("pro", "api")).toBe(false); // Pro pero no admin
    expect(await integrationOwnerHas("admin-avanzado", "webhooks")).toBe(false); // admin sin Pro
    const res = await checkIntegrationFeature("admin-avanzado", "webhooks");
    expect(res?.status).toBe(402);
    expect((await res!.json()).error).toContain("admin con licencia Pro");
  });
});

describe("catálogo anterior y organizaciones internas", () => {
  it("legacy: manda el plan de la organización, no la licencia de la persona", async () => {
    db.org = { ...baseOrg, plan: "ESSENTIAL", legacyUntil: new Date(Date.now() + 30 * 864e5) };
    // El Básico anterior tenía IA para todos y no tenía bots.
    expect(await userHasFeature("basico", "aiAssist")).toBe(true);
    expect(await userHasFeature("pro", "aiAgent")).toBe(false);
    expect(await channelHasFeature({ waAccountId: "wa-pro" }, "aiAgent")).toBe(false);
    // En legacy la API sigue la regla anterior (sin exigir licencia).
    expect(await integrationOwnerHas("pro", "api")).toBe(true);
    const body = await (await checkUserFeature("basico", "campaigns"))!.json();
    expect(body.error).toContain("Tu plan Básico");
    expect(body.actionUrl).toBe("/configuracion/plan");
  });

  it("legacy vencido: rigen las licencias", async () => {
    db.org = { ...baseOrg, plan: "PRO", legacyUntil: new Date(Date.now() - 864e5) };
    expect(await userHasFeature("basico", "aiAssist")).toBe(false);
  });

  it("interna: todo encendido, sin importar licencias ni dueños", async () => {
    db.org = { ...baseOrg, isInternal: true };
    expect(await userHasFeature("basico", "leadScoring")).toBe(true);
    expect(await channelHasFeature({ waAccountId: "wa-sin-dueno" }, "aiAgent")).toBe(true);
  });
});
