import { describe, expect, it } from "vitest";
import { contentDisposition, isPdfMime, mimeTypeToExtension } from "@/lib/whatsapp/media-shared";

describe("mimeTypeToExtension", () => {
  it("ignora los parámetros del MIME (codecs)", () => {
    expect(mimeTypeToExtension("audio/ogg; codecs=opus")).toBe("ogg");
    expect(mimeTypeToExtension("audio/ogg;codecs=opus")).toBe("ogg");
  });

  it("mapea los tipos habituales", () => {
    expect(mimeTypeToExtension("application/pdf")).toBe("pdf");
    expect(mimeTypeToExtension("audio/mp4")).toBe("m4a");
    expect(mimeTypeToExtension(null)).toBe("bin");
  });
});

describe("isPdfMime", () => {
  it("detecta PDF con y sin parámetros", () => {
    expect(isPdfMime("application/pdf")).toBe(true);
    expect(isPdfMime("application/pdf; charset=binary")).toBe(true);
    expect(isPdfMime("application/octet-stream")).toBe(false);
    expect(isPdfMime(null)).toBe(false);
  });
});

describe("contentDisposition", () => {
  it("manda el nombre real en filename* y un fallback ASCII", () => {
    expect(contentDisposition("Billing _ Google AI Studio.pdf", true)).toBe(
      `inline; filename="Billing _ Google AI Studio.pdf"; filename*=UTF-8''Billing%20_%20Google%20AI%20Studio.pdf`
    );
  });

  it("sanea comillas y caracteres no ASCII del fallback", () => {
    const header = contentDisposition('Constancia "ñ" .pdf', false);
    expect(header.startsWith('attachment; filename="Constancia ___ .pdf"')).toBe(true);
    expect(header).toContain("filename*=UTF-8''Constancia%20%22%C3%B1%22%20.pdf");
  });

  it("escapa apóstrofes y paréntesis en filename*", () => {
    expect(contentDisposition("factura (1)'s.pdf", false)).toContain(
      "filename*=UTF-8''factura%20%281%29%27s.pdf"
    );
  });

  it("sin filename solo lleva el tipo", () => {
    expect(contentDisposition(null, false)).toBe("attachment");
    expect(contentDisposition(null, true)).toBe("inline");
  });
});
