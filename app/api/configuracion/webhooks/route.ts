import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/integrations/admin-session";
import { createWebhook, serializeWebhook, webhookCreateSchema, WebhookAccessError, WebhookInputError, WebhookLimitError } from "@/lib/webhooks/crud";
import { publicErrorMessage } from "@/lib/api-errors";
import { USERS_PATH } from "@/lib/billing/gates";
import { orgWhere } from "@/lib/tenancy";

export async function GET() {
  try {
    const admin = await requireAdmin();
    if (admin instanceof NextResponse) return admin;
    const endpoints = await prisma.webhookEndpoint.findMany({
      where: { ...(await orgWhere(admin.userId)) },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(endpoints.map(serializeWebhook));
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    if (admin instanceof NextResponse) return admin;
    const parsed = webhookCreateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    const { endpoint, secret } = await createWebhook(admin.userId, parsed.data);
    return NextResponse.json({ webhook: serializeWebhook(endpoint), secret }, { status: 201 });
  } catch (error) {
    if (error instanceof WebhookAccessError) {
      return NextResponse.json({ error: error.message, code: "plan_limit", limit: "webhooks", actionUrl: USERS_PATH }, { status: 402 });
    }
    if (error instanceof WebhookInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof WebhookLimitError) {
      return NextResponse.json({ error: error.message, code: "limit_reached", current: error.current, max: error.max }, { status: 409 });
    }
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}
