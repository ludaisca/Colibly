import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  findMany: vi.fn(async (_args: unknown) => [] as unknown[]),
  orgForAccount: "org1" as string | null,
  allowedOwners: new Set<string>(["admin-pro"]),
  create: vi.fn(async (args: { data: { endpointId: string } }) => ({ id: `d-${args.data.endpointId}` })),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { webhookEndpoint: { findMany: (a: unknown) => db.findMany(a) }, webhookDelivery: { create: (a: { data: { endpointId: string } }) => db.create(a) } } }));
vi.mock("@/lib/queue", () => ({ webhookDeliveryQueue: { add: vi.fn() } }));
// Regla 5 de las licencias: el dueño del endpoint es admin con webhooks.
vi.mock("@/lib/billing/entitlements", () => ({ integrationOwnerHas: vi.fn(async (userId: string) => db.allowedOwners.has(userId)) }));
vi.mock("@/lib/billing/gates", () => ({
  isOrgWritable: vi.fn(async () => true),
  orgIdForAccount: vi.fn(async () => db.orgForAccount),
}));
vi.mock("@/lib/integrations/account-scope", () => ({ resolveIntegrationScope: vi.fn(), scopeIncludes: vi.fn(() => true) }));
vi.mock("./../payload", () => ({ buildPublicEvent: vi.fn(async () => ({ id: "e1", type: "contact.created" })) }));

import { fanOutToWebhooks } from "@/lib/webhooks/fanout";
import type { DomainEvent } from "@/lib/events/types";

const event = {
  id: "e1",
  occurredAt: new Date().toISOString(),
  type: "contact.created",
  account: { kind: "whatsapp", id: "acc1" },
  chat: null,
  contactId: "c1",
  data: { origin: "ORGANIC", source: "inbound" },
} as DomainEvent;

describe("fanOutToWebhooks: alcance multi-tenant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.orgForAccount = "org1";
  });

  it("solo consulta webhooks de la organización dueña de la cuenta del evento, con dueño admin activo", async () => {
    await fanOutToWebhooks(event);
    const where = (db.findMany.mock.calls[0][0] as { where: Record<string, unknown> }).where;
    expect(where.organizationId).toBe("org1");
    expect(where.user).toEqual({ role: "admin", disabledAt: null });
    expect(where.active).toBe(true);
  });

  it("si la cuenta no existe (borrada) no consulta nada", async () => {
    db.orgForAccount = null;
    expect(await fanOutToWebhooks(event)).toBe(0);
    expect(db.findMany).not.toHaveBeenCalled();
  });
});

describe("fanOutToWebhooks: licencia del dueño de cada endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.orgForAccount = "org1";
  });

  it("solo entrega a los endpoints cuyo dueño tiene webhooks en su licencia", async () => {
    db.findMany.mockResolvedValueOnce([
      { id: "w-pro", userId: "admin-pro", organizationId: "org1", accountIds: [], channelAccountIds: [] },
      { id: "w-basico", userId: "admin-basico", organizationId: "org1", accountIds: [], channelAccountIds: [] },
    ]);
    expect(await fanOutToWebhooks(event)).toBe(1);
    expect(db.create).toHaveBeenCalledTimes(1);
    expect((db.create.mock.calls[0][0] as { data: { endpointId: string } }).data.endpointId).toBe("w-pro");
  });
});
