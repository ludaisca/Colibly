import { getPlatformSettings } from "@/lib/platform-settings";

// Medición del sitio público (landing y registro). Configuración editable
// desde /plataforma — ver lib/platform-settings.ts. Sin los ids no se carga
// ningún script ni aparece el aviso de cookies.

export interface AnalyticsConfig {
  metaPixelId: string | null;
  gaMeasurementId: string | null;
  googleAdsId: string | null;
  googleAdsSignupLabel: string | null;
}

// Los ids van dentro de <script> del lado del cliente: solo se aceptan con su
// formato esperado para que un valor mal pegado no inyecte nada.
const FORMATS = {
  metaPixelId: /^\d{6,20}$/,
  gaMeasurementId: /^G-[A-Z0-9]{4,20}$/,
  googleAdsId: /^AW-\d{6,15}$/,
  googleAdsSignupLabel: /^[A-Za-z0-9_-]{4,40}$/,
} as const;

function validOrNull(name: keyof typeof FORMATS, value: string | null): string | null {
  if (!value) return null;
  if (!FORMATS[name].test(value)) {
    console.warn(`[analytics] ${name} con formato inválido; se ignora`);
    return null;
  }
  return value;
}

export async function getAnalyticsConfig(): Promise<AnalyticsConfig | null> {
  const settings = await getPlatformSettings();
  const config: AnalyticsConfig = {
    metaPixelId: validOrNull("metaPixelId", settings.metaPixelId),
    gaMeasurementId: validOrNull("gaMeasurementId", settings.gaMeasurementId),
    googleAdsId: validOrNull("googleAdsId", settings.googleAdsId),
    googleAdsSignupLabel: validOrNull("googleAdsSignupLabel", settings.googleAdsSignupLabel),
  };
  return config.metaPixelId || config.gaMeasurementId || config.googleAdsId ? config : null;
}
