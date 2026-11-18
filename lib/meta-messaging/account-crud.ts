import { randomBytes } from "crypto";
import type { Channel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { encrypt, decrypt, hashToken } from "@/lib/crypto";
import { validatePageToken } from "@/lib/meta/validate-page-token";
import { subscribePageToApp, unsubscribePageFromApp } from "@/lib/meta-messaging";
import { accountManageWhere, requireOrgId } from "@/lib/tenancy";
import { claimChannelOwner } from "@/lib/billing/user-license";
import { invalidateAccountScopes } from "@/lib/shared-accounts";

// Lógica compartida por app/api/messenger/accounts y app/api/instagram/
// accounts — mismo espíritu que lib/meta/conversions.ts (un núcleo, wrappers
// finos por variante) en vez de duplicar el flujo completo dos veces.

interface CreateInput {
  userId: string;
  channel: Channel; // "MESSENGER" | "INSTAGRAM"
  name: string;
  pageId: string;
  pageAccessToken: string;
  /** Solo en la conexión manual (app propia del cliente). */
  appSecret?: string;
  instagramBusinessId?: string;
  /** "platform": conectada con la app de Colibly (platform-connect.ts). */
  connection?: "manual" | "platform";
}

const ACCOUNT_SELECT = { id: true, name: true, channel: true, status: true, createdAt: true } as const;

export async function createMetaChannelAccount(
  input: CreateInput
): Promise<{ account: { id: string; name: string; channel: Channel; status: string; createdAt: Date }; verifyToken: string }> {
  // Mismo espíritu que validateToken() de WhatsApp: atrapa un pageId/token
  // mal copiado de inmediato en vez de descubrirlo con el primer webhook real.
  await validatePageToken(input.pageId, input.pageAccessToken);

  // entry[].id del webhook reporta el Page ID para Messenger, el ID de
  // Instagram para IG — ver app/api/meta/webhook/messaging/route.ts.
  const externalAccountId = input.channel === "INSTAGRAM" ? input.instagramBusinessId! : input.pageId;

  const verifyToken = randomBytes(24).toString("hex");
  const credentials = encrypt(
    JSON.stringify({
      pageId: input.pageId,
      pageAccessToken: input.pageAccessToken,
      ...(input.connection === "platform" ? { connection: "platform" } : { appSecret: input.appSecret }),
      ...(input.instagramBusinessId ? { instagramBusinessId: input.instagramBusinessId } : {}),
    })
  );

  const account = await prisma.channelAccount.create({
    data: {
      userId: input.userId,
      organizationId: await requireOrgId(input.userId),
      channel: input.channel,
      name: input.name,
      credentials,
      externalAccountId,
      verifyTokenHash: hashToken(verifyToken),
      status: "PENDING",
    },
    select: ACCOUNT_SELECT,
  });
  invalidateAccountScopes();
  await claimChannelOwner("channel", account.id, input.userId);

  // Equivalente a Telegram setWebhook(): sin esto, Meta nunca manda
  // webhooks a la cuenta recién creada aunque todo lo demás esté bien.
  try {
    // subscribed_fields REEMPLAZA los campos de la Página: Messenger e
    // Instagram de la misma Página piden los mismos ("feed" = comentarios de
    // Facebook) para que conectar uno no le quite nada al otro. Los
    // comentarios de Instagram llegan por el webhook de Instagram de la app
    // (field "comments"), no por esta suscripción.
    await subscribePageToApp(input.pageAccessToken, input.pageId, ["feed"]);
    const connected = await prisma.channelAccount.update({
      where: { id: account.id },
      data: { status: "CONNECTED", lastActivity: new Date() },
      select: ACCOUNT_SELECT,
    });
    return { account: connected, verifyToken };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al suscribir la Página";
    await prisma.channelAccount.update({ where: { id: account.id }, data: { status: "ERROR", errorMessage: message } });
    throw new Error(`Cuenta validada pero falló la suscripción de la Página: ${message}`);
  }
}

// Retorna false si la cuenta no existe/no es del usuario — el caller decide
// el 404. Best-effort en la desuscripción, mismo criterio que
// deleteWebhook() de Telegram: un token revocado o la red caída no debe
// impedir borrar el registro local.
export async function deleteMetaChannelAccount(id: string, userId: string, channel: Channel): Promise<boolean> {
  // Cualquier admin de la organización o el dueño, como Telegram (nunca solo quien la creó).
  const existing = await prisma.channelAccount.findFirst({ where: { id, channel, ...(await accountManageWhere(userId)) } });
  if (!existing) return false;

  try {
    const { pageId, pageAccessToken } = JSON.parse(decrypt(existing.credentials)) as { pageId: string; pageAccessToken: string };
    // La suscripción es de la Página: si otra cuenta (el Messenger o el
    // Instagram de la misma Página) la sigue usando, no se quita.
    const siblings = await prisma.channelAccount.findMany({
      where: { id: { not: id }, channel: { in: ["MESSENGER", "INSTAGRAM"] }, organizationId: existing.organizationId },
      select: { credentials: true },
    });
    const shared = siblings.some((a) => {
      try {
        return (JSON.parse(decrypt(a.credentials)) as { pageId?: string }).pageId === pageId;
      } catch {
        return false;
      }
    });
    if (!shared) await unsubscribePageFromApp(pageAccessToken, pageId);
  } catch (err) {
    console.error(`[${channel.toLowerCase()}] No se pudo desregistrar la suscripción al eliminar la cuenta:`, err);
  }

  await prisma.channelAccount.delete({ where: { id } });
  invalidateAccountScopes();
  return true;
}
