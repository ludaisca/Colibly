// Mensajes de error para el operador: en español, sin filtrar credenciales.

// Quita de un mensaje cualquier valor secreto (claves del bucket, contraseña de
// la base). Los secretos muy cortos se ignoran para no tachar texto común.
export function redactSecrets(message: string, secrets: Array<string | null | undefined>): string {
  let out = message;
  for (const secret of secrets) {
    if (secret && secret.length >= 6) out = out.split(secret).join("••••");
  }
  return out;
}

interface S3ErrorLike {
  name?: string;
  code?: string;
  message?: string;
  $metadata?: { httpStatusCode?: number };
}

export function describeS3Error(err: unknown): string {
  const e = (err ?? {}) as S3ErrorLike;
  const name = e.name ?? e.code ?? "";
  const status = e.$metadata?.httpStatusCode;

  if (name === "NoSuchBucket") return "El bucket no existe (revisa el nombre).";
  if (name === "InvalidAccessKeyId") return "El Access Key ID no es válido para este almacenamiento.";
  if (name === "SignatureDoesNotMatch") return "El Secret Access Key no coincide con el Access Key ID.";
  if (name === "AccessDenied" || status === 403) return "Acceso denegado: la clave no tiene permiso de lectura y escritura sobre ese bucket.";
  if (name === "ENOTFOUND" || e.code === "ENOTFOUND") return "No se encontró el servidor del endpoint (revisa la URL).";
  if (name === "ECONNREFUSED" || e.code === "ECONNREFUSED") return "El endpoint rechazó la conexión.";
  if (name === "ETIMEDOUT" || e.code === "ETIMEDOUT" || name === "TimeoutError") return "El endpoint no respondió a tiempo.";
  if (name === "PermanentRedirect" || status === 301) return "La región o el endpoint no corresponden a ese bucket.";
  const detail = (e.message ?? "").slice(0, 200);
  return `No se pudo usar el almacenamiento${name ? ` (${name})` : ""}${detail ? `: ${detail}` : ""}`;
}
