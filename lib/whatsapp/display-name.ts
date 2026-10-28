import { decrypt } from "@/lib/crypto";
import { getDisplayNameStatus } from "@/lib/whatsapp";

const APPROVED_TTL_MS = 60 * 60 * 1000;
const PENDING_TTL_MS = 2 * 60 * 1000;

const cache = new Map<string, { approved: boolean; expiresAt: number }>();

export async function isWhatsAppDisplayNameApproved(account: {
  phoneNumberId: string | null;
  accessToken: string | null;
}): Promise<boolean> {
  if (!account.phoneNumberId || !account.accessToken) return false;
  const hit = cache.get(account.phoneNumberId);
  if (hit && hit.expiresAt > Date.now()) return hit.approved;
  let approved = false;
  try {
    const status = await getDisplayNameStatus(account.phoneNumberId, decrypt(account.accessToken));
    approved = status === "APPROVED";
  } catch {
    approved = false;
  }
  cache.set(account.phoneNumberId, {
    approved,
    expiresAt: Date.now() + (approved ? APPROVED_TTL_MS : PENDING_TTL_MS),
  });
  return approved;
}
