import { Prisma } from "@prisma/client";
import { claimChannelOwner } from "@/lib/billing/user-license";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { coexistenceSyncQueue } from "@/lib/queue";
import { getMetaPlatformApp } from "@/lib/meta/platform-app";
import { EmbeddedSignupError, generateRegistrationPin, type EmbeddedSignupDeps, type PlatformApp } from "./complete";
import { exchangeCodeForToken, listWabaPhoneNumbers, lookupTokenUserId, registerPhoneNumber, subscribeAppToWaba } from "./meta";
import { invalidateAccountScopes } from "@/lib/shared-accounts";

// Dependencias reales (Graph + Prisma + BullMQ) del alta con Embedded Signup.
// El flujo en sí vive en ./complete.ts y se prueba con dependencias falsas.

export class PlatformNotConfiguredError extends EmbeddedSignupError {
  constructor() {
    super("La conexión con un clic todavía no está disponible. Escríbenos para activarla.", 503, "platform_not_configured");
  }
}

// App ID + App Secret de la plataforma, o error 503 si falta algo.
export async function requirePlatformApp(): Promise<PlatformApp & { configId: string }> {
  const app = await getMetaPlatformApp();
  if (!app.appId || !app.appSecret || !app.embeddedSignupConfigId) throw new PlatformNotConfiguredError();
  return { appId: app.appId, appSecret: app.appSecret, configId: app.embeddedSignupConfigId };
}

export function realEmbeddedSignupDeps(app: PlatformApp): EmbeddedSignupDeps {
  return {
    now: () => new Date(),
    exchangeCodeForToken: (code) => exchangeCodeForToken({ appId: app.appId, appSecret: app.appSecret, code }),
    listWabaPhoneNumbers,
    subscribeAppToWaba,
    registerPhoneNumber,
    lookupTokenUserId: (token) => lookupTokenUserId({ appId: app.appId, appSecret: app.appSecret, token }),
    generatePin: generateRegistrationPin,
    phoneNumberIdTaken: async (phoneNumberId) => !!(await prisma.wAAccount.findUnique({ where: { phoneNumberId }, select: { id: true } })),
    // WAAccount tiene @@unique([userId, name]): si el nombre ya existe se agrega un sufijo.
    uniqueAccountName: async (userId, desired) => {
      let name = desired;
      for (let n = 2; n < 50; n++) {
        const taken = await prisma.wAAccount.findFirst({ where: { userId, name }, select: { id: true } });
        if (!taken) return name;
        name = `${desired} (${n})`;
      }
      return `${desired} (${Date.now()})`;
    },
    createAccount: async (data) => {
      try {
        const now = new Date();
        const account = await prisma.wAAccount.create({
          data: {
            userId: data.userId,
            organizationId: data.organizationId,
            name: data.name,
            phoneNumber: data.phoneNumber,
            phoneNumberId: data.phoneNumberId,
            wabaId: data.wabaId,
            appId: data.appId,
            accessToken: encrypt(data.accessTokenPlain),
            connectionType: "EMBEDDED_SIGNUP",
            status: "CONNECTED",
            lastActivity: now,
            tokenExpiresAt: data.tokenExpiresAt,
            twoStepPin: data.twoStepPinPlain ? encrypt(data.twoStepPinPlain) : null,
            metaUserId: data.metaUserId,
            coexistence: data.coexistence,
            syncStatus: data.coexistence ? "PENDING" : "NONE",
            syncDeadlineAt: data.syncDeadlineAt,
            businessAppOnboardedAt: data.coexistence ? now : null,
          },
          select: { id: true },
        });
        invalidateAccountScopes();
        await claimChannelOwner("whatsapp", account.id, data.userId);
        return account;
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          throw new EmbeddedSignupError("Este número de WhatsApp ya está conectado en Colibly.", 409, "phone_in_use");
        }
        throw err;
      }
    },
    enqueueCoexistenceSync: async (accountId) => {
      await coexistenceSyncQueue.add("sync", { accountId }, { jobId: `coexistence-sync-${accountId}-${Date.now()}` });
    },
  };
}
