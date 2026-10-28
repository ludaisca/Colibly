import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ status: vi.fn() }));

vi.mock("@/lib/whatsapp", () => ({ getDisplayNameStatus: mocks.status }));
vi.mock("@/lib/crypto", () => ({ decrypt: () => "token-descifrado" }));

import { getDisplayNameState } from "@/lib/whatsapp/display-name";

// Ids distintos por prueba: el módulo cachea por phoneNumberId.
function account(phoneNumberId: string) {
  return { phoneNumberId, accessToken: "cifrado" };
}

beforeEach(() => {
  mocks.status.mockReset();
});

describe("getDisplayNameState", () => {
  it("aprobado", async () => {
    mocks.status.mockResolvedValue("APPROVED");
    expect(await getDisplayNameState(account("phone-approved"))).toBe("approved");
  });

  it("cualquier otro estado es no aprobado", async () => {
    mocks.status.mockResolvedValue("PENDING_REVIEW");
    expect(await getDisplayNameState(account("phone-pending"))).toBe("not_approved");
    mocks.status.mockResolvedValue("DECLINED");
    expect(await getDisplayNameState(account("phone-declined"))).toBe("not_approved");
  });

  it("un timeout no se confunde con un nombre pendiente", async () => {
    mocks.status.mockRejectedValue(new Error("The operation was aborted due to timeout"));
    expect(await getDisplayNameState(account("phone-timeout"))).toBe("unknown");
  });

  it("una respuesta sin name_status es desconocida, no pendiente", async () => {
    mocks.status.mockResolvedValue(null);
    expect(await getDisplayNameState(account("phone-null"))).toBe("unknown");
  });

  it("cachea el estado para no preguntar en cada envío", async () => {
    mocks.status.mockResolvedValue("APPROVED");
    expect(await getDisplayNameState(account("phone-cache"))).toBe("approved");
    expect(await getDisplayNameState(account("phone-cache"))).toBe("approved");
    expect(mocks.status).toHaveBeenCalledTimes(1);
  });
});
