import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/crypto";

// Configuración de negocio de la plataforma, editable desde /plataforma
// (nunca env vars — ver AGENTS.md "AI providers"/"Billing"/"Auth"). Único
// choke-point que lee/escribe PlatformSettings; todo lo demás pasa por aquí.

const SETTINGS_ID = "platform";
const CACHE_TTL_MS = 30_000;

export interface PlatformSettings {
  opencodeApiKey: string | null;
  googleApiKey: string | null;
  stripeSecretKey: string | null;
  stripeWebhookSecret: string | null;
  stripePriceBasic: string | null;
  stripePricePro: string | null;
  smtpHost: string | null;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string | null;
  smtpPass: string | null;
  emailFrom: string | null;
  turnstileSiteKey: string | null;
  turnstileSecretKey: string | null;
  metaAppId: string | null;
  metaAppSecret: string | null;
  metaEmbeddedSignupConfigId: string | null;
  metaWebhookVerifyToken: string | null;
  metaPixelId: string | null;
  metaCapiAccessToken: string | null;
  gaMeasurementId: string | null;
  googleAdsId: string | null;
  googleAdsSignupLabel: string | null;
  backupEnabled: boolean;
  backupEndpoint: string | null;
  backupRegion: string | null;
  backupBucket: string | null;
  backupPrefix: string | null;
  backupAccessKeyId: string | null;
  backupSecretAccessKey: string | null;
  backupHour: number;
  backupIncludeMedia: boolean;
}

function decryptOrNull(value: string | null | undefined): string | null {
  return value ? decrypt(value) : null;
}

async function loadSettings(): Promise<PlatformSettings> {
  const row = await prisma.platformSettings.findUnique({ where: { id: SETTINGS_ID } });
  return {
    opencodeApiKey: decryptOrNull(row?.opencodeApiKey),
    googleApiKey: decryptOrNull(row?.googleApiKey),
    stripeSecretKey: decryptOrNull(row?.stripeSecretKey),
    stripeWebhookSecret: decryptOrNull(row?.stripeWebhookSecret),
    stripePriceBasic: row?.stripePriceBasic ?? null,
    stripePricePro: row?.stripePricePro ?? null,
    smtpHost: row?.smtpHost ?? null,
    smtpPort: row?.smtpPort ?? 587,
    smtpSecure: row?.smtpSecure ?? false,
    smtpUser: row?.smtpUser ?? null,
    smtpPass: decryptOrNull(row?.smtpPass),
    emailFrom: row?.emailFrom ?? null,
    turnstileSiteKey: row?.turnstileSiteKey ?? null,
    turnstileSecretKey: decryptOrNull(row?.turnstileSecretKey),
    metaAppId: row?.metaAppId ?? null,
    metaAppSecret: decryptOrNull(row?.metaAppSecret),
    metaEmbeddedSignupConfigId: row?.metaEmbeddedSignupConfigId ?? null,
    metaWebhookVerifyToken: decryptOrNull(row?.metaWebhookVerifyToken),
    metaPixelId: row?.metaPixelId ?? null,
    metaCapiAccessToken: decryptOrNull(row?.metaCapiAccessToken),
    gaMeasurementId: row?.gaMeasurementId ?? null,
    googleAdsId: row?.googleAdsId ?? null,
    googleAdsSignupLabel: row?.googleAdsSignupLabel ?? null,
    backupEnabled: row?.backupEnabled ?? false,
    backupEndpoint: row?.backupEndpoint ?? null,
    backupRegion: row?.backupRegion ?? null,
    backupBucket: row?.backupBucket ?? null,
    backupPrefix: row?.backupPrefix ?? null,
    backupAccessKeyId: decryptOrNull(row?.backupAccessKeyId),
    backupSecretAccessKey: decryptOrNull(row?.backupSecretAccessKey),
    backupHour: row?.backupHour ?? 3,
    backupIncludeMedia: row?.backupIncludeMedia ?? false,
  };
}

let cache: { value: PlatformSettings; expiresAt: number } | null = null;

export async function getPlatformSettings(): Promise<PlatformSettings> {
  if (cache && cache.expiresAt > Date.now()) return cache.value;
  const value = await loadSettings();
  cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  return value;
}

// Llamar después de cualquier PATCH desde /api/plataforma/configuracion.
export function invalidatePlatformSettingsCache(): void {
  cache = null;
}

// Campos cifrados en texto plano → PlatformSettings (para el PATCH de la API).
// `null` explícito borra el campo; `undefined`/ausente lo deja igual.
export type PlatformSettingsInput = Partial<{
  [K in keyof PlatformSettings]: PlatformSettings[K] | null;
}>;

const ENCRYPTED_FIELDS = new Set<keyof PlatformSettings>([
  "opencodeApiKey",
  "googleApiKey",
  "stripeSecretKey",
  "stripeWebhookSecret",
  "smtpPass",
  "turnstileSecretKey",
  "metaCapiAccessToken",
  "metaAppSecret",
  "metaWebhookVerifyToken",
  "backupAccessKeyId",
  "backupSecretAccessKey",
]);

export async function updatePlatformSettings(input: PlatformSettingsInput, updatedByEmail: string): Promise<void> {
  const data: Record<string, unknown> = { updatedByEmail };
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (typeof value === "string" && ENCRYPTED_FIELDS.has(key as keyof PlatformSettings)) {
      data[key] = value ? encrypt(value) : null;
    } else {
      data[key] = value;
    }
  }
  await prisma.platformSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, ...data },
    update: data,
  });
  invalidatePlatformSettingsCache();
}
