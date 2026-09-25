import { describe, expect, it } from "vitest";
import { isBlockedAddress, parseSafeUrl, safeFetch, SafeFetchError } from "../safe-fetch";

describe("isBlockedAddress", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.10",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255",
    "::1",
    "::",
    "fd00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "::ffff:a00:1", // 10.0.0.1 en forma hexadecimal
    "64:ff9b::a00:1",
  ])("bloquea %s", (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it.each(["8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"])("permite %s", (ip) => {
    expect(isBlockedAddress(ip)).toBe(false);
  });

  it("trata lo que no es IP como bloqueado", () => {
    expect(isBlockedAddress("example.com")).toBe(true);
  });
});

describe("parseSafeUrl", () => {
  it("exige https fuera de desarrollo", () => {
    expect(() => parseSafeUrl("http://example.com/hook", false)).toThrow(SafeFetchError);
    expect(parseSafeUrl("https://example.com/hook", false).hostname).toBe("example.com");
  });

  it("rechaza credenciales en la URL", () => {
    expect(() => parseSafeUrl("https://user:pass@example.com", false)).toThrow(/usuario/);
  });

  // El parser WHATWG normaliza estas formas a 127.0.0.1 — el caso del SSRF
  // que wacrm tuvo que parchar (#588).
  it.each([
    "https://127.0.0.1/",
    "https://2130706433/",
    "https://0177.0.0.1/",
    "https://0x7f.1/",
    "https://[::1]/",
    "https://[::ffff:169.254.169.254]/",
    "https://169.254.169.254/latest/meta-data/",
  ])("bloquea el literal %s", (url) => {
    expect(() => parseSafeUrl(url, false)).toThrow(expect.objectContaining({ code: "BLOCKED_ADDRESS" }));
  });

  it("permite loopback, LAN privada y http si se habilita (desarrollo)", () => {
    expect(parseSafeUrl("http://127.0.0.1:9000/hook", true).port).toBe("9000");
    expect(parseSafeUrl("http://192.168.1.20/hook", true).hostname).toBe("192.168.1.20");
  });

  it("ni en desarrollo permite link-local / metadata de la nube", () => {
    expect(() => parseSafeUrl("http://169.254.169.254/latest", true)).toThrow(
      expect.objectContaining({ code: "BLOCKED_ADDRESS" })
    );
    expect(() => parseSafeUrl("http://[::ffff:169.254.169.254]/", true)).toThrow(SafeFetchError);
    expect(() => parseSafeUrl("http://100.64.0.1/", true)).toThrow(SafeFetchError);
  });
});

describe("safeFetch", () => {
  it("bloquea un dominio que resuelve a loopback al conectar", async () => {
    // localhost resuelve a 127.0.0.1/::1: la validación ocurre en el lookup del
    // socket, no con el literal de la URL.
    await expect(safeFetch("https://localhost/", { allowPrivateNetwork: false })).rejects.toMatchObject({
      code: "BLOCKED_ADDRESS",
    });
  });
});
