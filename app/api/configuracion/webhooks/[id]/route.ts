import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/integrations/admin-session";
import { serializeWebhook, updateWebhook, webhookUpdateSchema, WebhookAccessError, WebhookInputError } from "@/lib/webhooks/crud";
import { publicErrorMessage } from "@/lib/api-errors";
import { orgWhere } from "@/lib/tenancy";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  try {
    const admin = await requireAdmin();
    if (admin instanceof NextResponse) return admin;
    const { id } = await params;
    const parsed = webhookUpdateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    const endpoint = await updateWebhook(admin.userId, id, parsed.data);
    if (!endpoint) return NextResponse.json({ error: "Webhook no encontrado" }, { status: 404 });
    return NextResponse.json(serializeWebhook(endpoint));
  } catch (error) {
    if (error instanceof WebhookAccessError) return NextResponse.json({ error: error.message, code: "plan_limit", limit: "webhooks" }, { status: 402 });
    if (error instanceof WebhookInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const admin = await requireAdmin();
    if (admin instanceof NextResponse) return admin;
    const { id } = await params;
    const { count } = await prisma.webhookEndpoint.deleteMany({ where: { id, ...(await orgWhere(admin.userId)) } });
    if (count === 0) return NextResponse.json({ error: "Webhook no encontrado" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}
