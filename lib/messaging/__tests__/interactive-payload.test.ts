import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { payloadFor } from "@/lib/messaging/outbound";

describe("payloadFor (lo que guarda la burbuja de un saliente interactivo)", () => {
  it("una lista conserva la descripción de las filas que la traen", () => {
    expect(payloadFor({ type: "list", text: "Elige", buttonLabel: "Ver", rows: [{ id: "a", title: "Uno", description: "Primera" }, { id: "b", title: "Dos" }] })).toEqual({
      buttons: [{ id: "a", title: "Uno", description: "Primera" }, { id: "b", title: "Dos" }],
      style: "list",
      buttonLabel: "Ver",
    });
  });

  it("los botones de respuesta no llevan descripción", () => {
    expect(payloadFor({ type: "buttons", text: "¿Sí?", buttons: [{ id: "s", title: "Sí", description: "x" }] })).toEqual({ buttons: [{ id: "s", title: "Sí" }] });
  });
});
