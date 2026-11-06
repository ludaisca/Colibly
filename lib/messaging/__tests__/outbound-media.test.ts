import { describe, expect, it } from "vitest";
import { defaultFilename, OutboundMediaError, resolveOutboundMime } from "../outbound-media";

describe("resolveOutboundMime", () => {
  it("usa el Content-Type del servidor", () => {
    expect(resolveOutboundMime("image", { header: "image/png", filename: "x" })).toBe("image/png");
    expect(resolveOutboundMime("audio", { header: "audio/ogg; codecs=opus", filename: "x" })).toBe("audio/ogg");
  });
  it("con application/octet-stream deduce por la extensión", () => {
    expect(resolveOutboundMime("document", { header: "application/octet-stream", filename: "Factura.PDF" })).toBe("application/pdf");
    expect(resolveOutboundMime("document", { header: null, filename: "lista.xlsx" })).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  });
  it("media.mimeType del integrador gana", () => {
    expect(resolveOutboundMime("video", { declared: "video/mp4", header: "text/html", filename: "x" })).toBe("video/mp4");
  });
  it("rechaza tipos que el canal no acepta, con la lista y la pista de mimeType", () => {
    expect(() => resolveOutboundMime("image", { header: "image/gif", filename: "a.gif" })).toThrow(OutboundMediaError);
    expect(() => resolveOutboundMime("document", { header: "text/html", filename: "index" })).toThrow(/Admitidos: application\/pdf.*media\.mimeType/);
  });
  it("nombre por defecto con la extensión del tipo", () => {
    expect(defaultFilename("document", "application/pdf")).toBe("documento.pdf");
    expect(defaultFilename("image", "image/jpeg")).toMatch(/^image\.(jpg|jpeg)$/);
  });
});

import { mediaLimitFor as mediaLimitForTest } from "@/lib/messaging/outbound-media";

describe("mediaLimitFor (límites de la bandeja por tipo)", () => {
  it("imagen 5 MB, audio y video 16 MB, documentos 20 MB", () => {
    expect(mediaLimitForTest("image/jpeg")).toMatchObject({ type: "image", maxBytes: 5 * 1024 * 1024 });
    expect(mediaLimitForTest("video/mp4")).toMatchObject({ type: "video", maxBytes: 16 * 1024 * 1024 });
    expect(mediaLimitForTest("audio/ogg")).toMatchObject({ type: "audio", maxBytes: 16 * 1024 * 1024 });
    expect(mediaLimitForTest("application/pdf")).toMatchObject({ type: "document", maxBytes: 20 * 1024 * 1024 });
  });
  it("sin tipo no hay regla propia", () => {
    expect(mediaLimitForTest("")).toBeNull();
    expect(mediaLimitForTest(null)).toBeNull();
  });
});
