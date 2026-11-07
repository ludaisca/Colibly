import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { getPlatformApiKey } from "@/lib/ai/platform";
import { fetchOpenCodeModelCatalog } from "@/lib/ai/providers/opencode";
import { getPlatformSettings, updatePlatformSettings, type PlatformSettingsInput } from "@/lib/platform-settings";
import { publicErrorMessage } from "@/lib/api-errors";

// Configuración de negocio de la plataforma (IA, Stripe, SMTP, Turnstile,
// medición), editable desde /plataforma en vez de variables de entorno. Cada
// cambio queda en el log con el correo del operador (mismo patrón que
// /api/plataforma/organizaciones/[id]).

const secretString = z.string().min(1).nullable().optional();
const plainString = z.string().min(1).nullable().optional();
// IDs de Meta: numéricos (App ID, ID de configuración de Embedded Signup).
const metaNumericId = z.string().regex(/^\d{5,25}$/, "Debe ser un ID numérico de Meta").nullable().optional();
// Token de verificación del webhook: lo inventa el operador y se pega en Meta.
const verifyToken = z.string().min(8, "Mínimo 8 caracteres").max(200).nullable().optional();

const updateSchema = z.object({
  opencodeApiKey: secretString,
  googleApiKey: secretString,
  aiProvider: z.enum(["opencode", "google"]).nullable().optional(),
  aiTextModel: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,80}$/, "Modelo de texto inválido").nullable().optional(),
  aiVisionModel: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,80}$/, "Modelo de imágenes inválido").nullable().optional(),
  stripeSecretKey: secretString,
  stripeWebhookSecret: secretString,
  stripePriceEssential: plainString,
  stripePriceBusiness: plainString,
  stripePricePro: plainString,
  stripeAutomaticTax: z.boolean().optional(),
  smtpHost: plainString,
  smtpPort: z.number().int().min(1).max(65535).nullable().optional(),
  smtpSecure: z.boolean().optional(),
  smtpUser: plainString,
  smtpPass: secretString,
  emailFrom: plainString,
  turnstileSiteKey: plainString,
  turnstileSecretKey: secretString,
  metaAppId: metaNumericId,
  metaAppSecret: secretString,
  metaEmbeddedSignupConfigId: metaNumericId,
  metaWebhookVerifyToken: verifyToken,
  metaPixelId: plainString,
  metaCapiAccessToken: secretString,
  gaMeasurementId: plainString,
  googleAdsId: plainString,
  googleAdsSignupLabel: plainString,
});

// El selector de /plataforma solo ofrece el catálogo en vivo, pero esta ruta es
// una API: un id con forma de Gemini llegaría a OpenCode y haría fallar cada
// respuesta del bot. Se valida contra el catálogo cuando responde; si OpenCode
// no responde, se rechazan al menos los ids de Google, que solo existen en el
// proveedor google.
async function invalidModelMessage(input: { aiTextModel?: string | null; aiVisionModel?: string | null }): Promise<string | null> {
  const chosen = [input.aiTextModel, input.aiVisionModel].filter((id): id is string => typeof id === "string" && id.length > 0);
  if (chosen.length === 0) return null;

  const apiKey = await getPlatformApiKey("opencode");
  const catalog = apiKey ? await fetchOpenCodeModelCatalog(apiKey) : null;
  for (const id of chosen) {
    if (catalog) {
      if (!catalog.some((m) => m.id === id)) {
        return `El modelo "${id}" no está en el catálogo de OpenCode. Elige uno de la lista.`;
      }
    } else if (/^gemini[-.]/i.test(id)) {
      return `El modelo "${id}" es de Google: ese id no funciona en OpenCode.`;
    }
  }
  return null;
}

// Nunca se re-envía un secreto ya guardado — solo si está configurado.
export async function GET() {
  const admin = await requirePlatformAdmin();
  if (admin instanceof NextResponse) return admin;

  const s = await getPlatformSettings();
  return NextResponse.json({
    hasOpencodeApiKey: !!s.opencodeApiKey,
    hasGoogleApiKey: !!s.googleApiKey,
    aiProvider: s.aiProvider,
    aiTextModel: s.aiTextModel,
    aiVisionModel: s.aiVisionModel,
    hasStripeSecretKey: !!s.stripeSecretKey,
    hasStripeWebhookSecret: !!s.stripeWebhookSecret,
    stripePriceEssential: s.stripePriceEssential,
    stripePriceBusiness: s.stripePriceBusiness,
    stripePricePro: s.stripePricePro,
    stripeAutomaticTax: s.stripeAutomaticTax,
    smtpHost: s.smtpHost,
    smtpPort: s.smtpPort,
    smtpSecure: s.smtpSecure,
    smtpUser: s.smtpUser,
    hasSmtpPass: !!s.smtpPass,
    emailFrom: s.emailFrom,
    turnstileSiteKey: s.turnstileSiteKey,
    hasTurnstileSecretKey: !!s.turnstileSecretKey,
    metaAppId: s.metaAppId,
    hasMetaAppSecret: !!s.metaAppSecret,
    metaEmbeddedSignupConfigId: s.metaEmbeddedSignupConfigId,
    hasMetaWebhookVerifyToken: !!s.metaWebhookVerifyToken,
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
    const modelError = await invalidModelMessage(parsed.data);
    if (modelError) return NextResponse.json({ error: modelError }, { status: 400 });

    await updatePlatformSettings(parsed.data as PlatformSettingsInput, admin.email);
    // Nunca loguear valores, ni siquiera los no-secretos — solo qué campos cambiaron.
    console.log(`[plataforma] ${admin.email} → actualizó configuración (${Object.keys(parsed.data).join(", ")})`);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "No se pudo guardar la configuración") }, { status: 500 });
  }
}
