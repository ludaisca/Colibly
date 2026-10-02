import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { getPlatformSettings, updatePlatformSettings, type PlatformSettingsInput } from "@/lib/platform-settings";
import { publicErrorMessage } from "@/lib/api-errors";

// Configuración de negocio de la plataforma (IA, Stripe, SMTP, Turnstile,
// medición), editable desde /plataforma en vez de variables de entorno. Cada
// cambio queda en el log con el correo del operador (mismo patrón que
// /api/plataforma/organizaciones/[id]).

const secretString = z.string().min(1).nullable().optional();
const plainString = z.string().min(1).nullable().optional();

const updateSchema = z.object({
  opencodeApiKey: secretString,
  googleApiKey: secretString,
  stripeSecretKey: secretString,
  stripeWebhookSecret: secretString,
  stripePriceBasic: plainString,
  stripePricePro: plainString,
  smtpHost: plainString,
  smtpPort: z.number().int().min(1).max(65535).nullable().optional(),
  smtpSecure: z.boolean().optional(),
  smtpUser: plainString,
  smtpPass: secretString,
  emailFrom: plainString,
  turnstileSiteKey: plainString,
  turnstileSecretKey: secretString,
  metaPixelId: plainString,
  metaCapiAccessToken: secretString,
  gaMeasurementId: plainString,
  googleAdsId: plainString,
  googleAdsSignupLabel: plainString,
});

// Nunca se re-envía un secreto ya guardado — solo si está configurado.
export async function GET() {
  const admin = await requirePlatformAdmin();
  if (admin instanceof NextResponse) return admin;

  const s = await getPlatformSettings();
  return NextResponse.json({
    hasOpencodeApiKey: !!s.opencodeApiKey,
    hasGoogleApiKey: !!s.googleApiKey,
    hasStripeSecretKey: !!s.stripeSecretKey,
    hasStripeWebhookSecret: !!s.stripeWebhookSecret,
    stripePriceBasic: s.stripePriceBasic,
    stripePricePro: s.stripePricePro,
    smtpHost: s.smtpHost,
    smtpPort: s.smtpPort,
    smtpSecure: s.smtpSecure,
    smtpUser: s.smtpUser,
    hasSmtpPass: !!s.smtpPass,
    emailFrom: s.emailFrom,
    turnstileSiteKey: s.turnstileSiteKey,
    hasTurnstileSecretKey: !!s.turnstileSecretKey,
    metaPixelId: s.metaPixelId,
    hasMetaCapiAccessToken: !!s.metaCapiAccessToken,
    gaMeasurementId: s.gaMeasurementId,
    googleAdsId: s.googleAdsId,
    googleAdsSignupLabel: s.googleAdsSignupLabel,
  });
}

export async function PATCH(req: Request) {
  const admin = await requirePlatformAdmin();
  if (admin instanceof NextResponse) return admin;

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  try {
    await updatePlatformSettings(parsed.data as PlatformSettingsInput, admin.email);
    // Nunca loguear valores, ni siquiera los no-secretos — solo qué campos cambiaron.
    console.log(`[plataforma] ${admin.email} → actualizó configuración (${Object.keys(parsed.data).join(", ")})`);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "No se pudo guardar la configuración") }, { status: 500 });
  }
}
