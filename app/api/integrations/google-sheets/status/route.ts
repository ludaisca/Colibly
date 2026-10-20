import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isGoogleOAuthConfigured } from "@/lib/google/oauth-client";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const account = await prisma.googleAccount.findUnique({ where: { userId: session.user.id } });
  if (!account) {
    return NextResponse.json({ connected: false, configured: isGoogleOAuthConfigured() });
  }

  return NextResponse.json({
    connected: true,
    configured: isGoogleOAuthConfigured(),
    googleEmail: account.googleEmail,
    spreadsheetId: account.spreadsheetId,
    lastSyncedAt: account.lastSyncedAt,
    lastSyncError: account.lastSyncError,
    enabled: account.enabled,
  });
}
