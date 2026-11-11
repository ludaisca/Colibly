import { beforeEach, describe, expect, it, vi } from "vitest";

const store = { contacts: [] as { id: string; remoteJid: string }[], tags: [] as { id: string; name: string }[], appointments: 0 };
const prismaMock = {
  tag: {
    findFirst: vi.fn(async ({ where }: { where: { name: string } }) => store.tags.find((t) => t.name === where.name) ?? null),
    create: vi.fn(async ({ data }: { data: { name: string } }) => { const t = { id: `t${store.tags.length}`, name: data.name }; store.tags.push(t); return t; }),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  },
  contact: {
    findMany: vi.fn(async () => store.contacts),
    create: vi.fn(async ({ data }: { data: { remoteJid: string } }) => { const c = { id: `c${store.contacts.length}`, remoteJid: data.remoteJid }; store.contacts.push(c); return c; }),
    deleteMany: vi.fn(async () => ({ count: store.contacts.length })),
    count: vi.fn(async () => store.contacts.length),
  },
  wAAppointment: {
    findFirst: vi.fn(async () => (store.appointments ? { id: "a" } : null)),
    create: vi.fn(async () => { store.appointments++; }),
  },
};
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/pipeline/ensure", () => ({
  ensureDefaultPipeline: vi.fn(async () => ({ stages: [{ id: "s-new", leadStatus: "NEW" }, { id: "s-q", leadStatus: "QUALIFIED" }] })),
}));

const lib = await import("../spa-aurora");

beforeEach(() => {
  store.contacts = [];
  store.tags = [];
  store.appointments = 0;
  Object.values(prismaMock).forEach((g) => Object.values(g).forEach((f) => (f as ReturnType<typeof vi.fn>).mockClear()));
});

describe("datos de ejemplo", () => {
  it("son 5 contactos con teléfonos ficticios y valores entre $650 y $1,800", () => {
    expect(lib.SAMPLE_CONTACTS).toHaveLength(5);
    for (const c of lib.SAMPLE_CONTACTS) {
      expect(c.jid).toMatch(/^52550000000\d$/);
      expect(c.name).toMatch(/\(ejemplo\)$/);
      expect(c.dealMxn).toBeGreaterThanOrEqual(650);
      expect(c.dealMxn).toBeLessThanOrEqual(1800);
    }
  });
  it("sembrar dos veces deja los mismos 5 contactos y una sola cita", async () => {
    const first = await lib.seedSampleData("org1", "u1");
    const second = await lib.seedSampleData("org1", "u1");
    expect(first.created).toBe(5);
    expect(second.created).toBe(0);
    expect(store.contacts).toHaveLength(5);
    expect(store.appointments).toBe(1);
  });
  it("todo contacto sembrado es de ejemplo y sin canal", async () => {
    await lib.seedSampleData("org1", "u1");
    for (const call of prismaMock.contact.create.mock.calls as unknown as [{ data: Record<string, unknown> }][]) {
      expect(call[0].data.isSample).toBe(true);
      expect(call[0].data.organizationId).toBe("org1");
      expect(call[0].data.accountId).toBeUndefined();
    }
  });
  it("borrar solo toca los contactos de ejemplo de la organización", async () => {
    await lib.deleteSampleData("org1");
    expect(prismaMock.contact.deleteMany).toHaveBeenCalledWith({ where: { organizationId: "org1", isSample: true } });
  });
});

describe("tomorrowAt", () => {
  it("mañana a las 11:00 de la Ciudad de México es 17:00 UTC", () => {
    expect(lib.tomorrowAt(11, new Date("2026-11-10T15:00:00Z")).toISOString()).toBe("2026-11-11T17:00:00.000Z");
  });
  it("usa el día de México, no el de UTC (a las 02:00 UTC en México aún es el día anterior)", () => {
    expect(lib.tomorrowAt(11, new Date("2026-11-10T02:00:00Z")).toISOString()).toBe("2026-11-10T17:00:00.000Z");
  });
});

describe("hasRealData: cuándo se ofrece cargar ejemplos", () => {
  it("una org vacía puede cargar ejemplos", () => {
    expect(lib.hasRealDataFrom({ waAccounts: 0, channelAccounts: 0, realContacts: 0 })).toBe(false);
    expect(lib.canLoadSampleData({ loaded: false, hasRealData: false })).toBe(true);
  });
  it("con un canal conectado o contactos reales ya no se ofrece", () => {
    expect(lib.hasRealDataFrom({ waAccounts: 4, channelAccounts: 0, realContacts: 1350 })).toBe(true);
    expect(lib.hasRealDataFrom({ waAccounts: 0, channelAccounts: 1, realContacts: 0 })).toBe(true);
    expect(lib.hasRealDataFrom({ waAccounts: 0, channelAccounts: 0, realContacts: 2 })).toBe(true);
    expect(lib.canLoadSampleData({ loaded: false, hasRealData: true })).toBe(false);
  });
  it("si ya hay ejemplos cargados no se vuelven a ofrecer (se ofrece borrarlos)", () => {
    expect(lib.canLoadSampleData({ loaded: true, hasRealData: false })).toBe(false);
  });
});
