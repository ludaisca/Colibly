// Medición del sitio público (landing y registro). Todo sale de variables de
// entorno leídas en tiempo de ejecución: sin ellas no se carga ningún script
// ni aparece el aviso de cookies.

export interface AnalyticsConfig {
  metaPixelId: string | null;
  gaMeasurementId: string | null;
  googleAdsId: string | null;
  googleAdsSignupLabel: string | null;
}

// Los ids van dentro de <script> del lado del cliente: solo se aceptan con su
// formato esperado para que un valor mal pegado no inyecte nada.
const FORMATS = {
  META_PIXEL_ID: /^\d{6,20}$/,
  GA_MEASUREMENT_ID: /^G-[A-Z0-9]{4,20}$/,
  GOOGLE_ADS_ID: /^AW-\d{6,15}$/,
  GOOGLE_ADS_SIGNUP_LABEL: /^[A-Za-z0-9_-]{4,40}$/,
} as const;

function envId(name: keyof typeof FORMATS): string | null {
  const value = process.env[name]?.trim();
  if (!value) return null;
  if (!FORMATS[name].test(value)) {
    console.warn(`[analytics] ${name} con formato inválido; se ignora`);
    return null;
  }
  return value;
}

export function getAnalyticsConfig(): AnalyticsConfig | null {
  const config: AnalyticsConfig = {
    metaPixelId: envId("META_PIXEL_ID"),
    gaMeasurementId: envId("GA_MEASUREMENT_ID"),
    googleAdsId: envId("GOOGLE_ADS_ID"),
    googleAdsSignupLabel: envId("GOOGLE_ADS_SIGNUP_LABEL"),
  };
  return config.metaPixelId || config.gaMeasurementId || config.googleAdsId ? config : null;
}
