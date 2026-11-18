import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { forbidRoles } from "@/lib/roles";
import { rateLimit } from "@/lib/rate-limit";
import { requireVerifiedEmail } from "@/lib/auth-emails";
import { requireOrgId } from "@/lib/tenancy";
import { checkPlanLimit } from "@/lib/billing/gates";
import { assertChannelEnabled } from "@/lib/channel-flags";
import { createMetaChannelAccount } from "@/lib/meta-messaging/account-crud";
import { MessagingConnectError, endMessagingConnectSession, loadMessagingConnectSession } from "@/lib/meta-messaging/platform-connect";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  sessionId: z.string().min(20).max(64),
  selections: z
    .array(z.object({ pageId: z.string().regex(/^\d{1,30}$/), channel: z.enum(["MESSENGER", "INSTAGRAM"]) }))
    .min(1, "Elige al menos una Página o cuenta")
    .max(20),
});

const PLAN_KEY = { MESSENGER: "messenger", INSTAGRAM: "instagram" } as const;

// Paso 2 de "Conectar con Facebook": crea una cuenta por cada Página
// (Messenger) o Instagram elegido, con los mismos candados que el alta manual
// (correo verificado, canal habilitado, límite del plan) y la app de la
// plataforma (sin secreto del cliente). Responde qué se conectó y qué no.
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const denied = forbidRoles(session, ["ejecutivo"]);
    if (denied) return denied;
    const unverified = await requireVerifiedEmail(session.user.id);
    if (unverified) return unverified;
    const { allowed } = await rateLimit(`channel-account-create:${session.user.id}`, 10, 60);
    if (!allowed) return NextResponse.json({ error: "Demasiadas solicitudes, espera un momento" }, { status: 429 });

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    const { sessionId, selections } = parsed.data;
    const organizationId = await requireOrgId(session.user.id);
    const pages = await loadMessagingConnectSession(session.user.id, sessionId);

    const connected: Array<{ id: string; channel: string; name: string }> = [];
    const failed: Array<{ pageId: string; channel: string; error: string }> = [];
    for (const { pageId, channel } of selections) {
      const page = pages.find((p) => p.id === pageId);
      if (!page) {
        failed.push({ pageId, channel, error: "Esa Página no estaba en tu autorización" });
        continue;
      }
      if (channel === "INSTAGRAM" && !page.instagram) {
        failed.push({ pageId, channel, error: "La Página no tiene una cuenta profesional de Instagram vinculada" });
        continue;
      }
      const externalId = channel === "INSTAGRAM" ? page.instagram!.id : page.id;
      const taken = await prisma.channelAccount.findFirst({ where: { channel, externalAccountId: externalId }, select: { id: true } });
      if (taken) {
        failed.push({ pageId, channel, error: "Ya está conectada" });
        continue;
      }
      const blocked = (await assertChannelEnabled(organizationId, channel)) ?? (await checkPlanLimit(organizationId, PLAN_KEY[channel]));
      if (blocked) {
        const body = (await blocked.json().catch(() => ({}))) as { error?: string };
        failed.push({ pageId, channel, error: body.error ?? "Tu plan no permite otra cuenta de este canal" });
        continue;
      }
      try {
        const name = channel === "INSTAGRAM" ? (page.instagram!.username ? `@${page.instagram!.username}` : page.name) : page.name;
        const { account } = await createMetaChannelAccount({
          userId: session.user.id,
          channel,
          name: name.slice(0, 100),
          pageId: page.id,
          pageAccessToken: page.token,
          instagramBusinessId: channel === "INSTAGRAM" ? page.instagram!.id : undefined,
          connection: "platform",
        });
        connected.push({ id: account.id, channel, name: account.name });
      } catch (err) {
        failed.push({ pageId, channel, error: err instanceof Error ? err.message : "No se pudo conectar" });
      }
    }
    if (failed.length === 0) await endMessagingConnectSession(sessionId);
    console.log(`[meta messaging-connect] ${session.user.id}: ${connected.length} conectada(s), ${failed.length} con error`);
    return NextResponse.json({ connected, failed }, { status: connected.length > 0 ? 201 : 400 });
  } catch (error) {
    if (error instanceof MessagingConnectError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[meta messaging-connect/complete]", error);
    return NextResponse.json({ error: "No se pudo conectar" }, { status: 500 });
  }
}
