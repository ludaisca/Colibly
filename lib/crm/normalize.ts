import { digitsOnly, jidCandidates } from "@/lib/phone";

// Normalización PURA de los datos de una persona/empresa (sin base de datos).

export function cleanText(value: unknown, max = 200): string | null {
  if (typeof value !== "string") return null;
  const v = value.replace(/\s+/g, " ").trim();
  return v ? v.slice(0, max) : null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Correo en minúsculas o null; `invalid` distingue "no vino" de "vino mal".
export function normalizeEmail(raw: unknown): { email: string | null; invalid: boolean } {
  const v = cleanText(raw, 254);
  if (!v) return { email: null, invalid: false };
  const email = v.toLowerCase();
  return EMAIL_RE.test(email) ? { email, invalid: false } : { email: null, invalid: true };
}

// Teléfono capturado por una persona: conserva lo que escribió (para mostrar) y
// guarda los dígitos (para buscar y deduplicar). 7–15 dígitos (E.164).
export function normalizePersonPhone(raw: unknown): { phone: string | null; phoneDigits: string | null; invalid: boolean } {
  const v = cleanText(raw, 40);
  if (!v) return { phone: null, phoneDigits: null, invalid: false };
  const digits = digitsOnly(v);
  if (digits.length < 7 || digits.length > 15) return { phone: null, phoneDigits: null, invalid: true };
  return { phone: v, phoneDigits: digits, invalid: false };
}

// Llave de comparación de teléfonos: dos móviles mexicanos 52…/521… dan la misma.
export function phoneKey(digits: string | null | undefined): string | null {
  const d = digitsOnly(digits);
  if (d.length < 7) return null;
  const candidates = jidCandidates(d);
  return candidates.length ? [...candidates].sort()[0] : d;
}

// Formas bajo las que puede estar guardado un teléfono (para `phoneDigits: { in }`).
export function phoneForms(digits: string | null | undefined): string[] {
  const d = digitsOnly(digits);
  return d.length >= 7 ? jidCandidates(d) : [];
}

export function emailKey(email: string | null | undefined): string | null {
  const { email: e } = normalizeEmail(email);
  return e;
}

export function companyNameKey(name: string | null | undefined): string | null {
  const v = cleanText(name);
  return v ? v.toLowerCase() : null;
}
