import crypto from "crypto";

// TOTP (RFC 6238) con HMAC-SHA1, pasos de 30 s y 6 dígitos: lo que usan Google
// Authenticator, Microsoft Authenticator, 1Password, Authy… Implementación
// propia y pura (sin dependencia) con los vectores oficiales en los tests.

export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;
/** Tolerancia de reloj: el paso anterior y el siguiente también valen (±30 s). */
export const TOTP_WINDOW = 1;

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index === -1) throw new Error("Secreto base32 inválido");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Secreto nuevo de 160 bits (lo que recomienda el RFC 4226 para SHA-1), en base32. */
export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

export function totpStep(nowMs: number): number {
  return Math.floor(nowMs / 1000 / TOTP_STEP_SECONDS);
}

/** Código HOTP (RFC 4226) para un contador; el secreto en bytes. */
export function hotp(secret: Buffer, counter: number, digits = TOTP_DIGITS, algorithm: "sha1" | "sha256" | "sha512" = "sha1"): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac(algorithm, secret).update(message).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, "0");
}

export function totp(secretBase32: string, nowMs: number): string {
  return hotp(base32Decode(secretBase32), totpStep(nowMs));
}

/**
 * Verifica un código y devuelve el paso que coincidió (para impedir que el
 * mismo código se use dos veces) o null. Comparación en tiempo constante.
 */
export function verifyTotp(secretBase32: string, code: string, nowMs: number, window = TOTP_WINDOW): number | null {
  const normalized = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(normalized)) return null;
  const secret = base32Decode(secretBase32);
  const current = totpStep(nowMs);
  for (let delta = -window; delta <= window; delta++) {
    const step = current + delta;
    const expected = hotp(secret, step);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(normalized))) return step;
  }
  return null;
}

/** URI que leen las apps autenticadoras (y que va dentro del QR). */
export function otpauthUri(secretBase32: string, account: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret: secretBase32, issuer, algorithm: "SHA1", digits: String(TOTP_DIGITS), period: String(TOTP_STEP_SECONDS) });
  return `otpauth://totp/${label}?${params.toString()}`;
}

// --- Códigos de respaldo ---------------------------------------------------

export const BACKUP_CODE_COUNT = 10;
const BACKUP_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // sin 0/o, 1/l/i

/** 10 códigos "xxxx-xxxx" para mostrar UNA vez; se guardan solo sus hashes. */
export function generateBackupCodes(count = BACKUP_CODE_COUNT): string[] {
  return Array.from({ length: count }, () => {
    const bytes = crypto.randomBytes(8);
    const chars = Array.from(bytes, (byte) => BACKUP_ALPHABET[byte % BACKUP_ALPHABET.length]).join("");
    return `${chars.slice(0, 4)}-${chars.slice(4)}`;
  });
}

export function normalizeBackupCode(code: string): string {
  return code.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** sha256 del código normalizado: tienen 40 bits de azar y un solo uso, no hace falta bcrypt. */
export function hashBackupCode(code: string): string {
  return crypto.createHash("sha256").update(normalizeBackupCode(code)).digest("hex");
}

/** ¿Parece un código de respaldo (8 caracteres del alfabeto) y no un TOTP? */
export function looksLikeBackupCode(code: string): boolean {
  const normalized = normalizeBackupCode(code);
  return normalized.length === 8 && !/^\d+$/.test(normalized);
}
