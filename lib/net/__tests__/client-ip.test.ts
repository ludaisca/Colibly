import { afterEach, describe, expect, it } from "vitest";
import { clientIp } from "@/lib/net/client-ip";

const req = (headers: Record<string, string>) => new Request("https://app.test/x", { headers });

describe("clientIp (regla de IP confiable)", () => {
  afterEach(() => {
    delete process.env.TRUSTED_CLIENT_IP_HEADER;
  });

  it("prefiere X-Real-Ip (lo escribe Traefik) sobre X-Forwarded-For", () => {
    expect(clientIp(req({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "1.1.1.1, 203.0.113.7" }))).toBe("203.0.113.7");
  });

  it("sin X-Real-Ip usa el ÚLTIMO salto de X-Forwarded-For, nunca el primero (lo inventa el cliente)", () => {
    expect(clientIp(req({ "x-forwarded-for": "6.6.6.6, 198.51.100.4" }))).toBe("198.51.100.4");
    // Rotar el primer valor ya no cambia el cubo del límite.
    expect(clientIp(req({ "x-forwarded-for": "7.7.7.7, 198.51.100.4" }))).toBe("198.51.100.4");
  });

  it("ignora valores que no son IP y cae a 'unknown'", () => {
    expect(clientIp(req({ "x-real-ip": "<script>", "x-forwarded-for": "hola" }))).toBe("unknown");
    expect(clientIp(req({}))).toBe("unknown");
  });

  it("TRUSTED_CLIENT_IP_HEADER manda si está configurado (CDN delante)", () => {
    process.env.TRUSTED_CLIENT_IP_HEADER = "CF-Connecting-IP";
    expect(clientIp(req({ "cf-connecting-ip": "2001:db8::1", "x-real-ip": "10.0.0.2" }))).toBe("2001:db8::1");
    // Sin el header configurado, sigue la regla normal.
    expect(clientIp(req({ "x-real-ip": "10.0.0.2" }))).toBe("10.0.0.2");
  });
});
