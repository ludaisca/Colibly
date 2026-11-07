import { NextResponse } from "next/server";
import { requirePlatformToken } from "@/lib/platform/tokens";
import { getPlatformSettings, PLATFORM_SECRET_FIELDS } from "@/lib/platform-settings";

export const dynamic = "force-dynamic";

// Configuración visible por API: nunca devuelve secretos, solo has*.
export async function GET(req: Request) {
  const ctx = await requirePlatformToken(req, "platform:read");
  if (ctx instanceof NextResponse) return ctx;

  const settings = await getPlatformSettings();
  const has = Object.fromEntries(
    PLATFORM_SECRET_FIELDS.map((field) => {
      const value = settings[field];
      const name = `has${field.charAt(0).toUpperCase()}${field.slice(1)}`;
      return [name, Boolean(value)];
    })
  );

  return NextResponse.json(
    {
      ok: true,
      data: {
        stripePriceEssential: settings.stripePriceEssential,
        stripePriceBusiness: settings.stripePriceBusiness,
        stripePricePro: settings.stripePricePro,
        stripeAutomaticTax: settings.stripeAutomaticTax,
        smtpHost: settings.smtpHost,
        smtpPort: settings.smtpPort,
        smtpSecure: settings.smtpSecure,
        smtpUser: settings.smtpUser,
        emailFrom: settings.emailFrom,
        turnstileSiteKey: settings.turnstileSiteKey,
        metaAppId: settings.metaAppId,
        metaEmbeddedSignupConfigId: settings.metaEmbeddedSignupConfigId,
        aiProvider: settings.aiProvider,
        aiTextModel: settings.aiTextModel,
        aiVisionModel: settings.aiVisionModel,
        backupEnabled: settings.backupEnabled,
        backupEndpoint: settings.backupEndpoint,
        backupRegion: settings.backupRegion,
        backupBucket: settings.backupBucket,
        backupPrefix: settings.backupPrefix,
        backupHour: settings.backupHour,
        backupIncludeMedia: settings.backupIncludeMedia,
        ...has,
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
