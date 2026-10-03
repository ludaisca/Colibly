import { describe, expect, it } from "vitest";
import { vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/queue", () => ({ coexistenceSyncQueue: { add: vi.fn() }, mediaDownloadQueue: { add: vi.fn() } }));
vi.mock("@/lib/meta/platform-app", () => ({ validateWhatsAppWebhookSignature: vi.fn() }));
vi.mock("@/lib/automations/dispatch", () => ({ pauseConversationalRuns: vi.fn() }));

import { chunkArray, COEXISTENCE_FIELDS } from "../webhook";

describe("chunkArray", () => {
  it("parte en lotes del tamaño pedido", () => {
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunkArray([], 3)).toEqual([]);
    expect(chunkArray([1, 2], 5)).toEqual([[1, 2]]);
  });
});

describe("campos de coexistencia", () => {
  it("son los tres que documenta Meta", () => {
    expect([...COEXISTENCE_FIELDS].sort()).toEqual(["history", "smb_app_state_sync", "smb_message_echoes"]);
  });
});
