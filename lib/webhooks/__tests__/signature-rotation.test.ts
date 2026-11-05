import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signingSecrets, signWebhookBody } from "../signature";

const hmac = (secret: string, t: number, body: string) => createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
const id = (v: string) => v;

describe("firma con periodo de gracia", () => {
  it("un secreto: el formato de siempre (una v1)", () => {
    expect(signWebhookBody("whsec_a", "{}", 100)).toBe(`t=100,v1=${hmac("whsec_a", 100, "{}")}`);
  });

  it("dos secretos: una v1 por secreto, la del nuevo primero", () => {
    expect(signWebhookBody(["whsec_nuevo", "whsec_viejo"], "{}", 100)).toBe(`t=100,v1=${hmac("whsec_nuevo", 100, "{}")},v1=${hmac("whsec_viejo", 100, "{}")}`);
  });

  it("el anterior firma solo mientras no vence", () => {
    const now = new Date("2026-11-05T12:00:00Z");
    const base = { secret: "nuevo", previousSecret: "viejo" };
    expect(signingSecrets({ ...base, previousSecretExpiresAt: new Date("2026-11-06T12:00:00Z") }, id, now)).toEqual(["nuevo", "viejo"]);
    expect(signingSecrets({ ...base, previousSecretExpiresAt: new Date("2026-11-05T11:59:59Z") }, id, now)).toEqual(["nuevo"]);
    expect(signingSecrets({ secret: "nuevo", previousSecret: null, previousSecretExpiresAt: null }, id, now)).toEqual(["nuevo"]);
  });
});
