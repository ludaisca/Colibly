import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/redis", () => ({ getRedisClient: vi.fn() }));
vi.mock("@/lib/platform-settings", () => ({ getPlatformSettings: vi.fn() }));

const { pageStates } = await import("../platform-connect");

describe("pageStates", () => {
  const pages = [
    { id: "p1", name: "Tienda", instagram: { id: "ig1", username: "tienda" } },
    { id: "p2", name: "Blog", instagram: null },
    { id: "p3", name: "Outlet", instagram: { id: "ig3", username: null } },
  ];

  it("libre, conectada aquí o en otra organización, por canal", () => {
    const existing = [
      { channel: "MESSENGER", externalAccountId: "p1", organizationId: "org-a" },
      { channel: "INSTAGRAM", externalAccountId: "ig3", organizationId: "org-b" },
    ];
    expect(pageStates(pages, existing, "org-a")).toEqual([
      { id: "p1", name: "Tienda", instagram: { id: "ig1", username: "tienda" }, messenger: "connected", instagramState: "available" },
      { id: "p2", name: "Blog", instagram: null, messenger: "available", instagramState: "none" },
      { id: "p3", name: "Outlet", instagram: { id: "ig3", username: null }, messenger: "available", instagramState: "elsewhere" },
    ]);
  });

  it("un id de Instagram igual a un Page ID no cruza canales", () => {
    const states = pageStates([{ id: "x", name: "X", instagram: { id: "x", username: null } }], [{ channel: "MESSENGER", externalAccountId: "x", organizationId: "o" }], "o");
    expect(states[0].messenger).toBe("connected");
    expect(states[0].instagramState).toBe("available");
  });
});
