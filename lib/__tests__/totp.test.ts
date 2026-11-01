import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  generateBackupCodes,
  generateTotpSecret,
  hashBackupCode,
  hotp,
  looksLikeBackupCode,
  otpauthUri,
  totp,
  verifyTotp,
} from "../totp";

// Vectores del apéndice B del RFC 6238 (SHA-1, secreto ASCII "12345678901234567890").
const RFC_SECRET = Buffer.from("12345678901234567890");
const RFC_B32 = base32Encode(RFC_SECRET);

describe("TOTP (RFC 6238)", () => {
  it.each([
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ])("t=%i → %s (8 dígitos)", (seconds, expected) => {
    expect(hotp(RFC_SECRET, Math.floor(seconds / 30), 8)).toBe(expected);
  });

  it("6 dígitos = últimos 6 del vector", () => {
    expect(totp(RFC_B32, 59_000)).toBe("287082");
  });

  it("base32 ida y vuelta (y el RFC 4648)", () => {
    expect(base32Encode(Buffer.from("foobar"))).toBe("MZXW6YTBOI");
    expect(base32Decode("MZXW 6YTB OI").toString()).toBe("foobar");
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Encode(base32Decode(secret))).toBe(secret);
  });

  it("verifica con ±1 paso de tolerancia y devuelve el paso", () => {
    const now = 1_700_000_000_000;
    const step = Math.floor(now / 30_000);
    expect(verifyTotp(RFC_B32, totp(RFC_B32, now), now)).toBe(step);
    expect(verifyTotp(RFC_B32, totp(RFC_B32, now - 30_000), now)).toBe(step - 1);
    expect(verifyTotp(RFC_B32, totp(RFC_B32, now + 30_000), now)).toBe(step + 1);
    expect(verifyTotp(RFC_B32, totp(RFC_B32, now - 90_000), now)).toBeNull();
  });

  it("rechaza formatos raros", () => {
    const now = 1_700_000_000_000;
    expect(verifyTotp(RFC_B32, "12345", now)).toBeNull();
    expect(verifyTotp(RFC_B32, "abcdef", now)).toBeNull();
    expect(verifyTotp(RFC_B32, ` ${totp(RFC_B32, now)} `, now)).not.toBeNull();
  });

  it("URI otpauth para el QR", () => {
    const uri = otpauthUri("JBSWY3DPEHPK3PXP", "ana@ejemplo.mx", "Colibly");
    expect(uri.startsWith("otpauth://totp/Colibly%3Aana%40ejemplo.mx?")).toBe(true);
    expect(uri).toContain("secret=JBSWY3DPEHPK3PXP");
    expect(uri).toContain("issuer=Colibly");
  });
});

describe("códigos de respaldo", () => {
  it("10 códigos distintos con formato xxxx-xxxx", () => {
    const codes = generateBackupCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) expect(code).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}$/);
  });

  it("el hash ignora mayúsculas, espacios y guiones", () => {
    expect(hashBackupCode("ABCD-EFGH")).toBe(hashBackupCode("abcd efgh"));
    expect(hashBackupCode("abcd-efgh")).not.toBe(hashBackupCode("abcd-efgj"));
  });

  it("distingue código de respaldo de TOTP", () => {
    expect(looksLikeBackupCode("abcd-ef23")).toBe(true);
    expect(looksLikeBackupCode("123456")).toBe(false);
    expect(looksLikeBackupCode("12345678")).toBe(false);
  });
});
