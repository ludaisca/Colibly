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

  // HEAD no trae cuerpo: el SDK solo dice "NotFound" cuando el bucket (o la carpeta) no existe.
  const detail = e.message ?? "";
  // R2 devuelve esto cuando en "Access Key ID" se pega el Secret (64) o el token de API (cfat_…).
  if (/access key has length/i.test(detail)) {
    return "El Access Key ID no tiene el formato correcto. En R2 son 32 caracteres: revisa que no hayas pegado ahí el Secret Access Key (64 caracteres) ni el token de API (empieza con «cfat_»).";
  }
  // HEAD sin cuerpo y 400: lo típico de credenciales mal formadas o invertidas.
  if ((name === "Unknown" || name === "UnknownError") && status === 400) {
    return "El almacenamiento rechazó la solicitud. Suele ser un Access Key ID o un Secret Access Key mal pegado (¿están invertidos?).";
  }
  if (name === "NoSuchBucket" || name === "NotFound" || status === 404) return "El bucket no existe (revisa el nombre).";
  if (name === "InvalidAccessKeyId") return "El Access Key ID no es válido para este almacenamiento.";
  if (name === "SignatureDoesNotMatch") return "El Secret Access Key no coincide con el Access Key ID.";
  if (name === "AccessDenied" || status === 403) return "Acceso denegado: la clave no tiene permiso de lectura y escritura sobre ese bucket.";
  if (name === "ENOTFOUND" || e.code === "ENOTFOUND") return "No se encontró el servidor del endpoint (revisa la URL).";
  if (name === "ECONNREFUSED" || e.code === "ECONNREFUSED") return "El endpoint rechazó la conexión.";
  if (name === "ETIMEDOUT" || e.code === "ETIMEDOUT" || name === "TimeoutError") return "El endpoint no respondió a tiempo.";
  if (name === "AuthorizationHeaderMalformed" || name === "IllegalLocationConstraintException") return "La región no corresponde a este almacenamiento (en R2 usa «auto»; en AWS, la región del bucket).";
  if (name === "PermanentRedirect" || status === 301) return "La región o el endpoint no corresponden a ese bucket.";
  const shortDetail = detail.slice(0, 200);
  return `No se pudo usar el almacenamiento${name ? ` (${name})` : ""}${shortDetail ? `: ${shortDetail}` : ""}`;
}
