import { describe, expect, it } from "vitest";
import { emailAllowsSignIn } from "../auth-policy";
import { isPlatformAdminEmailIn, parsePlatformAdminEmails } from "../platform-admin-emails";

describe("emailAllowsSignIn", () => {
  const admins = "luis@example.com, Jefa@Example.com ";

  it("un correo verificado entra", () => {
    expect(emailAllowsSignIn({ email: "cliente@example.com", emailVerifiedAt: new Date(), platformAdminEmails: admins })).toBe(true);
  });

  it("un correo sin verificar no entra", () => {
    expect(emailAllowsSignIn({ email: "bot@example.com", emailVerifiedAt: null, platformAdminEmails: admins })).toBe(false);
  });

  it("el dueño del SaaS está exento aunque no haya verificado", () => {
    expect(emailAllowsSignIn({ email: "luis@example.com", emailVerifiedAt: null, platformAdminEmails: admins })).toBe(true);
    expect(emailAllowsSignIn({ email: "JEFA@example.com", emailVerifiedAt: null, platformAdminEmails: admins })).toBe(true);
  });

  it("sin PLATFORM_ADMIN_EMAILS nadie está exento", () => {
    expect(emailAllowsSignIn({ email: "luis@example.com", emailVerifiedAt: null, platformAdminEmails: "" })).toBe(false);
    expect(emailAllowsSignIn({ email: "luis@example.com", emailVerifiedAt: null, platformAdminEmails: undefined })).toBe(false);
  });
});

describe("parsePlatformAdminEmails", () => {
  it("separa, limpia y quita duplicados", () => {
    expect(parsePlatformAdminEmails(" A@x.com, b@x.com , a@x.com ")).toEqual(["a@x.com", "b@x.com"]);
    expect(parsePlatformAdminEmails("")).toEqual([]);
    expect(parsePlatformAdminEmails(undefined)).toEqual([]);
  });

  it("compara sin distinguir mayúsculas", () => {
    expect(isPlatformAdminEmailIn("A@X.com", "a@x.com")).toBe(true);
    expect(isPlatformAdminEmailIn("A@X.com", "otro@x.com")).toBe(false);
    expect(isPlatformAdminEmailIn(undefined, "a@x.com")).toBe(false);
  });
});
