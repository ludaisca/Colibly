import { NextResponse } from "next/server";
import type { WAAccount, WAChat } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { BillingBlockedError } from "@/lib/billing/gates";
import { getUserAccountIds } from "@/lib/shared-accounts";
import { CallingError } from "./meta";

export function callingErrorResponse(error: unknown, fallback: string): NextResponse {
  if (error instanceof BillingBlockedError) {
    return NextResponse.json({ error: error.message, code: "read_only" }, { status: 402 });
  }
  if (error instanceof CallingError) {
    const code = error.status === 409 && /[Cc]oexistencia/.test(error.message)
      ? "coexistence"
      : error.metaCode === 138006 || /permission/i.test(error.message)
        ? "call_permission"
        : undefined;
    return NextResponse.json({ error: error.message, ...(code ? { code } : {}) }, { status: error.status >= 400 && error.status < 600 ? error.status : 502 });
  }
  const message = error instanceof Error && error.message ? error.message : fallback;
  return NextResponse.json({ error: fallback || message }, { status: 500 });
}

export function readSdp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const sdp = value.replace(/\0/g, "");
  if (sdp.length < 16 || sdp.length > 20_000 || !sdp.includes("v=0")) return null;
  return sdp;
}

export async function loadDirectChat(userId: string, chatId: string): Promise<(WAChat & { account: WAAccount }) | null> {
  const accountIds = await getUserAccountIds(userId);
  if (accountIds.length === 0) return null;
  return prisma.wAChat.findFirst({
    where: { id: chatId, accountId: { in: accountIds }, isGroup: false },
    include: { account: true },
  });
}

export function peerDigits(remoteJid: string): string {
  return remoteJid.replace(/\D/g, "");
}
