import type { PlatformSettings } from "@/lib/platform-settings";

// Configuración del respaldo ya validada y lista para usar. Se construye desde
// PlatformSettings (lib/platform-settings.ts); un respaldo con configuración
// incompleta falla con un mensaje claro en vez de intentar a medias.

export interface BackupConfig {
  endpoint: string | null; // null = AWS S3
  region: string;
  bucket: string;
  prefix: string;
  accessKeyId: string;
  secretAccessKey: string;
  includeMedia: boolean;
}

export type BackupConfigResult = { ok: true; config: BackupConfig } | { ok: false; missing: string[] };

// Hora del respaldo diario: siempre en hora de Ciudad de México (sin horario de
// verano desde 2022), sin importar la zona del servidor.
export const BACKUP_TIME_ZONE = "America/Mexico_City";

// "colibly/" → "colibly"; vacío → "colibly". Sin barras al inicio ni al final
// ni segmentos vacíos, para que las claves del bucket queden predecibles.
export function normalizePrefix(prefix: string | null | undefined): string {
  const clean = (prefix ?? "")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .join("/");
  return clean || "colibly";
}

export interface BackupObjectKeys {
  db: string;
  media: string;
  manifest: string;
  probe: string;
}

// Claves FIJAS: cada respaldo sobrescribe el anterior (S3 reemplaza el objeto
// de forma atómica al terminar la subida, así que el viejo sigue ahí hasta que
// el nuevo está completo).
export function objectKeys(prefix: string | null | undefined): BackupObjectKeys {
  const base = normalizePrefix(prefix);
  return {
    db: `${base}/colibly-db.dump`,
    media: `${base}/colibly-media.tar.gz`,
    manifest: `${base}/manifiesto.json`,
    probe: `${base}/.prueba-de-conexion`,
  };
}

export function resolveBackupConfig(s: PlatformSettings): BackupConfigResult {
  const missing: string[] = [];
  if (!s.backupBucket) missing.push("bucket");
  if (!s.backupAccessKeyId) missing.push("access key id");
  if (!s.backupSecretAccessKey) missing.push("secret access key");
  // Con endpoint propio (R2, MinIO…) la región suele ser "auto"; en AWS es obligatoria.
  if (!s.backupEndpoint && !s.backupRegion) missing.push("región");
  if (missing.length) return { ok: false, missing };

  return {
    ok: true,
    config: {
      endpoint: s.backupEndpoint?.trim() || null,
      region: s.backupRegion?.trim() || "auto",
      bucket: s.backupBucket!.trim(),
      prefix: normalizePrefix(s.backupPrefix),
      accessKeyId: s.backupAccessKeyId!,
      secretAccessKey: s.backupSecretAccessKey!,
      includeMedia: s.backupIncludeMedia,
    },
  };
}

// El endpoint recibe las credenciales del bucket: solo HTTPS, salvo en
// desarrollo (MinIO local). Devuelve un mensaje de error o null.
export function validateEndpoint(endpoint: string, isProduction: boolean): string | null {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return "El endpoint no es una URL válida (ej. https://<cuenta>.r2.cloudflarestorage.com)";
  }
  if (url.protocol === "https:") return null;
  if (url.protocol === "http:" && !isProduction) return null;
  return "El endpoint debe usar https";
}
