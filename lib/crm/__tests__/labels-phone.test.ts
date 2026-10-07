import { describe, expect, test } from "vitest";
import { sourceLabel } from "@/lib/crm/labels";
import { formatPhoneDisplay } from "@/lib/phone";
import { describeTimelineItem } from "@/lib/crm/timeline-ui";

describe("formatPhoneDisplay", () => {
  test("móvil mexicano con 52 o 521 se muestra igual", () => {
    expect(formatPhoneDisplay("525511110001")).toBe("+52 55 1111 0001");
    expect(formatPhoneDisplay("5215511110001")).toBe("+52 55 1111 0001");
    expect(formatPhoneDisplay("+52 55 1111 0001")).toBe("+52 55 1111 0001");
  });
  test("otros números llevan solo el +", () => {
    expect(formatPhoneDisplay("34600111222")).toBe("+34600111222");
    expect(formatPhoneDisplay("")).toBe("");
    expect(formatPhoneDisplay(null)).toBe("");
  });
});

describe("sourceLabel", () => {
  test("traduce los orígenes conocidos y deja pasar los demás", () => {
    expect(sourceLabel("whatsapp")).toBe("WhatsApp");
    expect(sourceLabel("webchat")).toBe("Chat web");
    expect(sourceLabel("import")).toBe("Importación");
    expect(sourceLabel("otro")).toBe("otro");
    expect(sourceLabel(null)).toBe("—");
  });
  test("la línea de tiempo usa el nombre legible", () => {
    const item = { key: "a", kind: "activity" as const, type: "person.created", at: "2026-10-07T00:00:00Z", actor: null, data: { source: "whatsapp" } };
    expect(describeTimelineItem(item)).toEqual({ title: "Contacto creado", detail: "WhatsApp" });
  });
});
