import { describe, expect, it } from "vitest";
import { nudgeUnsubscribeSignature, verifyNudgeUnsubscribe } from "../unsubscribe";
import { activationNudgeTemplate } from "@/lib/email/templates";
import { NUDGE_KEYS } from "../rules";

const KEY = "secreto-de-prueba";

describe("baja de consejos", () => {
  it("la firma depende de la organización y del secreto", () => {
    const sig = nudgeUnsubscribeSignature("org_1", KEY);
    expect(verifyNudgeUnsubscribe("org_1", sig, KEY)).toBe(true);
    expect(verifyNudgeUnsubscribe("org_2", sig, KEY)).toBe(false);
    expect(verifyNudgeUnsubscribe("org_1", sig, "otro")).toBe(false);
    expect(verifyNudgeUnsubscribe("org_1", sig.slice(1), KEY)).toBe(false);
    expect(verifyNudgeUnsubscribe("org_1", "", KEY)).toBe(false);
  });
});

describe("correo de consejo", () => {
  it.each(NUDGE_KEYS)("%s lleva baja de un clic, CTA y texto plano", (kind) => {
    const msg = activationNudgeTemplate({
      to: "a@b.mx",
      name: "Ana <script>",
      kind,
      url: "https://app.colibly.com/x",
      unsubscribeUrl: "https://app.colibly.com/api/correos/consejos/baja?o=1&s=2",
    });
    expect(msg.headers?.["List-Unsubscribe"]).toBe("<https://app.colibly.com/api/correos/consejos/baja?o=1&s=2>");
    expect(msg.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(msg.html).toContain("https://app.colibly.com/x");
    expect(msg.html).toContain("No quiero más consejos");
    expect(msg.html).not.toContain("<script>");
    expect(msg.text).toContain("https://app.colibly.com/api/correos/consejos/baja?o=1&amp;s=2".replace("&amp;", "&"));
  });
});
