import { describe, expect, it } from "vitest";
import { canonicalRemoteJid, isPhoneJid, remoteJidCandidates, isPhoneNameOf } from "@/lib/contacts/jid";
import { digitsOnly, jidCandidates, normalizePhone } from "@/lib/phone";

describe("jidCandidates", () => {
  it("reconoce las dos formas de un móvil mexicano", () => {
    expect(jidCandidates("5215512345678").sort()).toEqual(["525512345678", "5215512345678"].sort());
    expect(jidCandidates("525512345678").sort()).toEqual(["525512345678", "5215512345678"].sort());
  });
  it("no inventa variantes para otros países", () => {
    expect(jidCandidates("14155550123")).toEqual(["14155550123"]);
    expect(jidCandidates("573001234567")).toEqual(["573001234567"]);
  });
  it("limpia formato y vacío", () => {
    expect(jidCandidates("+52 1 55 1234 5678")).toContain("5215512345678");
    expect(jidCandidates("")).toEqual([]);
    expect(normalizePhone("+52 (55) 1234-5678")).toBe("525512345678");
    expect(digitsOnly(null)).toBe("");
  });
});

describe("isPhoneJid", () => {
  it("solo trata como teléfono los números", () => {
    expect(isPhoneJid("5215512345678")).toBe(true);
    expect(isPhoneJid("120363025@g.us")).toBe(false);
    expect(isPhoneJid("123456")).toBe(false);
    expect(isPhoneJid("987654321012345678")).toBe(false);
  });
});

describe("canonicalRemoteJid", () => {
  it("usa la forma que ya existe en la base, aunque llegue la otra", () => {
    expect(canonicalRemoteJid("5215512345678", ["525512345678"])).toBe("525512345678");
    expect(canonicalRemoteJid("525512345678", ["5215512345678"])).toBe("5215512345678");
  });
  it("da prioridad al contacto sobre el chat", () => {
    expect(canonicalRemoteJid("525512345678", ["5215512345678", "525512345678"])).toBe("5215512345678");
    expect(canonicalRemoteJid("525512345678", [null, "5215512345678"])).toBe("5215512345678");
  });
  it("si la persona es nueva conserva lo que llegó, ya limpio", () => {
    expect(canonicalRemoteJid("5215512345678", [])).toBe("5215512345678");
    expect(canonicalRemoteJid(" 5215512345678 ", [null, undefined])).toBe("5215512345678");
  });
  it("no mezcla personas distintas", () => {
    expect(canonicalRemoteJid("5215512345678", ["525598765432"])).toBe("5215512345678");
  });
  it("no toca grupos ni ids de otros canales", () => {
    expect(canonicalRemoteJid("120363025@g.us", ["120363025@g.us"])).toBe("120363025@g.us");
    expect(canonicalRemoteJid("tg:abc", [])).toBe("tg:abc");
  });
});

describe("remoteJidCandidates", () => {
  it("expande teléfonos y deja grupos tal cual", () => {
    expect(remoteJidCandidates("5215512345678").sort()).toEqual(["525512345678", "5215512345678"].sort());
    expect(remoteJidCandidates("120363025@g.us")).toEqual(["120363025@g.us"]);
  });
});

describe("isPhoneNameOf", () => {
  it("un teléfono en cualquiera de sus formas no cuenta como nombre", () => {
    expect(isPhoneNameOf("525500000992", "5215500000992")).toBe(true);
    expect(isPhoneNameOf("5215500000992", "5215500000992")).toBe(true);
  });
  it("un nombre real o el teléfono de otra persona sí", () => {
    expect(isPhoneNameOf("Ana Real", "5215500000992")).toBe(false);
    expect(isPhoneNameOf("525599999999", "5215500000992")).toBe(false);
    expect(isPhoneNameOf(null, "5215500000992")).toBe(false);
  });
});
