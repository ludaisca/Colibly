import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/platform-settings", () => ({ getPlatformSettings: vi.fn() }));

import { resolveSmtpConfig } from "../mailer";

const none = { smtpHost: null, smtpPort: 587, smtpSecure: false, smtpUser: null, smtpPass: null, emailFrom: null };
const mailpit = { SMTP_HOST: "mailpit", SMTP_PORT: "1025", EMAIL_FROM: "Colibly <no-reply@colibly.com>" };

describe("resolveSmtpConfig", () => {
  it("usa /plataforma si tiene host (en cualquier entorno)", () =>
    expect(resolveSmtpConfig({ ...none, smtpHost: "smtp.resend.com", smtpUser: "u", smtpPass: "p" }, { NODE_ENV: "production", ...mailpit })).toMatchObject({ host: "smtp.resend.com", port: 587, user: "u" }));
  it("desarrollo sin /plataforma: Mailpit por env", () =>
    expect(resolveSmtpConfig(none, { NODE_ENV: "development", ...mailpit })).toEqual({ host: "mailpit", port: 1025, secure: false, user: null, pass: null, from: "Colibly <no-reply@colibly.com>" }));
  it("producción nunca lee SMTP_HOST del entorno", () => expect(resolveSmtpConfig(none, { NODE_ENV: "production", ...mailpit })).toBeNull());
  it("desarrollo sin nada: null (se imprime en el log)", () => expect(resolveSmtpConfig(none, { NODE_ENV: "development" })).toBeNull());
});
