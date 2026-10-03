import { createHmac } from "crypto";
import { describe, expect, it, vi } from "vitest";

// platform-app importa prisma (vía platform-settings) y crypto; ninguno hace
// falta para las funciones puras que se prueban aquí.
vi.mock("@/lib/platform-settings", () => ({ getPlatformSettings: vi.fn() }));
vi.mock("@/lib/crypto", () => ({ decrypt: (v: string) => v.replace(/^enc:/, "") }));

import {
  safeEqualStrings,
  validateWhatsAppWebhookSignature,
  verifyTokenMatches,
  webhookSecretSource,
} from "../platform-app";

const sign = (body: string, secret: string) => "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
const BODY = '{"object":"whatsapp_business_account","entry":[]}';

describe("safeEqualStrings / verifyTokenMatches", () => {
  it("iguales", () => expect(safeEqualStrings("abc12345", "abc12345")).toBe(true));
  it("distintos, aunque midan lo mismo", () => expect(safeEqualStrings("abc12345", "abc12346")).toBe(false));
  it("distintos en longitud", () => expect(safeEqualStrings("abc", "abc12345")).toBe(false));
  it("token correcto", () => expect(verifyTokenMatches("mi-token-largo", "mi-token-largo")).toBe(true));
  it("sin token configurado nunca coincide", () => {
    expect(verifyTokenMatches("algo", null)).toBe(false);
    expect(verifyTokenMatches("algo", undefined)).toBe(false);
    expect(verifyTokenMatches("algo", "")).toBe(false);
  });
  it("sin token recibido nunca coincide", () => expect(verifyTokenMatches("", "mi-token-largo")).toBe(false));
});

describe("webhookSecretSource", () => {
  it("manual usa el secreto de la cuenta", () => expect(webhookSecretSource({ connectionType: "MANUAL" })).toBe("account"));
  it("Embedded Signup usa el de la plataforma", () => expect(webhookSecretSource({ connectionType: "EMBEDDED_SIGNUP" })).toBe("platform"));
});

describe("validateWhatsAppWebhookSignature", () => {
  const platform = async () => "secreto-plataforma";

  it("cuenta manual: valida con SU secreto", async () => {
    const account = { connectionType: "MANUAL" as const, appSecret: "enc:secreto-cliente" };
    expect(await validateWhatsAppWebhookSignature(BODY, sign(BODY, "secreto-cliente"), account, platform)).toBe(true);
  });

  it("cuenta manual: una firma hecha con el secreto de la plataforma NO sirve", async () => {
    const account = { connectionType: "MANUAL" as const, appSecret: "enc:secreto-cliente" };
    expect(await validateWhatsAppWebhookSignature(BODY, sign(BODY, "secreto-plataforma"), account, platform)).toBe(false);
  });

  it("cuenta manual sin secreto: nunca valida", async () => {
    const account = { connectionType: "MANUAL" as const, appSecret: null };
    expect(await validateWhatsAppWebhookSignature(BODY, sign(BODY, "x"), account, platform)).toBe(false);
  });

  it("Embedded Signup: valida con el secreto de la plataforma", async () => {
    const account = { connectionType: "EMBEDDED_SIGNUP" as const, appSecret: null };
    expect(await validateWhatsAppWebhookSignature(BODY, sign(BODY, "secreto-plataforma"), account, platform)).toBe(true);
  });

  it("Embedded Signup: una firma con el secreto de un cliente NO sirve", async () => {
    const account = { connectionType: "EMBEDDED_SIGNUP" as const, appSecret: "enc:secreto-cliente" };
    expect(await validateWhatsAppWebhookSignature(BODY, sign(BODY, "secreto-cliente"), account, platform)).toBe(false);
  });

  it("Embedded Signup sin secreto de plataforma configurado: nunca valida", async () => {
    const account = { connectionType: "EMBEDDED_SIGNUP" as const, appSecret: null };
    expect(await validateWhatsAppWebhookSignature(BODY, sign(BODY, "x"), account, async () => null)).toBe(false);
  });

  it("firma ausente o cuerpo alterado: rechaza", async () => {
    const account = { connectionType: "EMBEDDED_SIGNUP" as const, appSecret: null };
    expect(await validateWhatsAppWebhookSignature(BODY, null, account, platform)).toBe(false);
    expect(await validateWhatsAppWebhookSignature(BODY + " ", sign(BODY, "secreto-plataforma"), account, platform)).toBe(false);
  });
});
