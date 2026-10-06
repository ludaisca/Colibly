import { describe, expect, it } from "vitest";
import { describeTimelineItem, type TimelineItem } from "../timeline-ui";

const item = (type: string, data: Record<string, unknown> = {}, kind: TimelineItem["kind"] = "activity"): TimelineItem => ({ key: type, kind, type, at: "2026-10-06T12:00:00Z", actor: null, data });

describe("describeTimelineItem", () => {
  it("describe el cambio de etapa de un negocio", () => {
    expect(describeTimelineItem(item("deal.stage_changed", { title: "Plan Pro", from: "Nuevo", to: "Ganado" }))).toEqual({ title: "Negocio «Plan Pro» cambió de etapa", detail: "Nuevo → Ganado" });
  });
  it("traduce los campos editados y el pase a cliente", () => {
    expect(describeTimelineItem(item("person.updated", { changes: { email: ["a", "b"], jobTitle: ["x", "y"] } })).detail).toBe("correo, puesto");
    expect(describeTimelineItem(item("person.updated", { changes: { lifecycle: ["LEAD", "CUSTOMER"] }, reason: "deal_won" })).title).toBe("Pasó a cliente al ganar un negocio");
  });
  it("tareas, mensajes, notas y citas", () => {
    expect(describeTimelineItem(item("task.completed", { title: "Llamar" }))).toEqual({ title: "Tarea completada", detail: "Llamar" });
    expect(describeTimelineItem(item("message.inbound", { channel: "WHATSAPP", text: "Hola" }, "message"))).toEqual({ title: "Mensaje recibido · WhatsApp", detail: "Hola" });
    expect(describeTimelineItem(item("note", { body: "Pidió descuento" }, "note")).detail).toBe("Pidió descuento");
    expect(describeTimelineItem(item("appointment.no_show", { title: "Valoración" }, "appointment"))).toEqual({ title: "Cita sin asistencia", detail: "Valoración" });
  });
  it("un tipo desconocido no rompe", () => {
    expect(describeTimelineItem(item("algo.nuevo")).title).toBe("algo.nuevo");
    expect(describeTimelineItem(item("person.updated", { changes: "raro" })).title).toBe("Datos actualizados");
  });
});
