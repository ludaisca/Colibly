import { describe, it, expect } from "vitest";
import { flowFieldLabel, flowFields } from "@/lib/whatsapp/flow-fields";

describe("flowFields", () => {
  it("limpia los nombres que pone el editor de Meta", () => {
    expect(flowFieldLabel("screen_0_Nombre_completo_0")).toBe("Nombre completo");
    expect(flowFieldLabel("fecha")).toBe("Fecha");
  });

  it("muestra opciones, listas y booleanos legibles y omite el token", () => {
    expect(flowFields({ flow_token: "x", screen_1_Sucursal_0: "0_CDMX_Centro", acepta: true, extras: ["1_Envío", "2_Instalación"], vacio: "" })).toEqual([
      { label: "Sucursal", value: "CDMX Centro" },
      { label: "Acepta", value: "Sí" },
      { label: "Extras", value: "Envío, Instalación" },
      { label: "Vacio", value: "—" },
    ]);
  });
});
