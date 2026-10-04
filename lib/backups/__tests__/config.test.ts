import { describe, it, expect } from "vitest";
import { normalizePrefix, objectKeys, resolveBackupConfig, validateEndpoint } from "../config";
import type { PlatformSettings } from "@/lib/platform-settings";

const base = {
  backupEnabled: true,
  backupEndpoint: "https://abc.r2.cloudflarestorage.com",
  backupRegion: null,
  backupBucket: "mi-bucket",
  backupPrefix: null,
  backupAccessKeyId: "AKIA",
  backupSecretAccessKey: "secreto",
  backupHour: 3,
  backupIncludeMedia: false,
} as unknown as PlatformSettings;

describe("normalizePrefix", () => {
  it("limpia barras y espacios", () => {
    expect(normalizePrefix("/colibly/prod/")).toBe("colibly/prod");
    expect(normalizePrefix(" a // b ")).toBe("a/b");
  });
  it("usa colibly por defecto", () => {
    expect(normalizePrefix(null)).toBe("colibly");
    expect(normalizePrefix("  / ")).toBe("colibly");
  });
});

describe("objectKeys", () => {
  it("son fijas: el respaldo de hoy sobrescribe el de ayer", () => {
    expect(objectKeys("prod")).toEqual({
      db: "prod/colibly-db.dump",
      media: "prod/colibly-media.tar.gz",
      manifest: "prod/manifiesto.json",
      probe: "prod/.prueba-de-conexion",
    });
    expect(objectKeys("prod")).toEqual(objectKeys("/prod/"));
  });
});

describe("resolveBackupConfig", () => {
  it("con endpoint propio la región es opcional (auto)", () => {
    const r = resolveBackupConfig(base);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.region).toBe("auto");
      expect(r.config.prefix).toBe("colibly");
      expect(r.config.endpoint).toBe("https://abc.r2.cloudflarestorage.com");
    }
  });
  it("en AWS (sin endpoint) la región es obligatoria", () => {
    const r = resolveBackupConfig({ ...base, backupEndpoint: null });
    expect(r).toEqual({ ok: false, missing: ["región"] });
  });
  it("lista lo que falta", () => {
    const r = resolveBackupConfig({ ...base, backupBucket: null, backupAccessKeyId: null, backupSecretAccessKey: null });
    expect(r).toEqual({ ok: false, missing: ["bucket", "access key id", "secret access key"] });
  });
});

describe("validateEndpoint", () => {
  it("acepta https", () => expect(validateEndpoint("https://s3.example.com", true)).toBeNull());
  it("rechaza http en producción pero lo permite en desarrollo", () => {
    expect(validateEndpoint("http://minio:9000", true)).toMatch(/https/);
    expect(validateEndpoint("http://minio:9000", false)).toBeNull();
  });
  it("rechaza lo que no es URL o no es http(s)", () => {
    expect(validateEndpoint("no-es-url", false)).toMatch(/no es una URL/);
    expect(validateEndpoint("minio:9000", false)).toMatch(/https/);
    expect(validateEndpoint("ftp://x.com", false)).toMatch(/https/);
  });
});
