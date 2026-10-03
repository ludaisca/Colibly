import { describe, expect, it } from "vitest";
import { isFacebookOrigin, parseSignupMessage } from "../session";

const msg = (o: object) => JSON.stringify({ type: "WA_EMBEDDED_SIGNUP", ...o });

describe("isFacebookOrigin", () => {
  it("acepta los dominios de Facebook por https", () => {
    for (const o of ["https://www.facebook.com", "https://web.facebook.com", "https://facebook.com"]) expect(isFacebookOrigin(o)).toBe(true);
  });
  it("rechaza imitaciones y http", () => {
    for (const o of ["https://facebook.com.evil.com", "https://evilfacebook.com", "http://www.facebook.com", "https://www.facebook.com:444", "null", ""]) {
      expect(isFacebookOrigin(o)).toBe(false);
    }
  });
});

describe("parseSignupMessage", () => {
  const ok = "https://www.facebook.com";
  it("FINISH de número nuevo", () => {
    expect(parseSignupMessage(ok, msg({ event: "FINISH", data: { phone_number_id: "111", waba_id: "222" } }))).toEqual({ kind: "finish", wabaId: "222", phoneNumberId: "111", coexistence: false });
  });
  it("FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING = coexistencia", () => {
    expect(parseSignupMessage(ok, msg({ event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING", data: { waba_id: "222" } }))).toEqual({ kind: "finish", wabaId: "222", phoneNumberId: "", coexistence: true });
  });
  it("FINISH sin waba_id es error", () => {
    expect(parseSignupMessage(ok, msg({ event: "FINISH", data: {} }))).toMatchObject({ kind: "error" });
  });
  it("CANCEL con el paso en que se canceló", () => {
    expect(parseSignupMessage(ok, msg({ event: "CANCEL", data: { current_step: "PHONE_NUMBER_SETUP" } }))).toEqual({ kind: "cancel", step: "PHONE_NUMBER_SETUP" });
  });
  it("ERROR con mensaje", () => {
    expect(parseSignupMessage(ok, msg({ event: "ERROR", data: { error_message: "falló" } }))).toEqual({ kind: "error", message: "falló" });
  });
  it("ignora otros orígenes, otros tipos, JSON roto y no-strings", () => {
    expect(parseSignupMessage("https://evil.com", msg({ event: "FINISH", data: { waba_id: "1" } }))).toEqual({ kind: "ignore" });
    expect(parseSignupMessage(ok, JSON.stringify({ type: "OTRA_COSA", event: "FINISH" }))).toEqual({ kind: "ignore" });
    expect(parseSignupMessage(ok, "no es json")).toEqual({ kind: "ignore" });
    expect(parseSignupMessage(ok, { type: "WA_EMBEDDED_SIGNUP" })).toEqual({ kind: "ignore" });
    expect(parseSignupMessage(ok, msg({ event: "PAGE_LOADED" }))).toEqual({ kind: "ignore" });
  });
});
