import { z } from "zod";

export const MACRO_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export const MACRO_SNOOZE_PRESETS = ["1h", "tomorrow", "week"] as const;

export const macroActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("assign_self") }),
  z.object({ type: z.literal("status"), status: z.enum(["OPEN", "RESOLVED"]) }),
  z.object({ type: z.literal("priority"), priority: z.enum(MACRO_PRIORITIES) }),
  z.object({ type: z.literal("snooze"), preset: z.enum(MACRO_SNOOZE_PRESETS) }),
  z.object({ type: z.literal("send_message"), body: z.string().trim().min(1).max(2000) }),
]);

export const macroInputSchema = z.object({
  name: z.string().trim().min(1, "La macro necesita un nombre").max(80),
  description: z.string().trim().max(300).optional().nullable(),
  actions: z.array(macroActionSchema).min(1, "Agrega al menos una acción").max(10),
});

export const macroUpdateSchema = macroInputSchema.partial();

export type MacroAction = z.infer<typeof macroActionSchema>;

export function macroActionLabel(action: MacroAction): string {
  switch (action.type) {
    case "assign_self": return "Asignarme";
    case "status": return action.status === "RESOLVED" ? "Resolver" : "Reabrir";
    case "priority": return `Prioridad ${action.priority.toLowerCase()}`;
    case "snooze": return `Posponer ${action.preset === "1h" ? "1 hora" : action.preset === "tomorrow" ? "hasta mañana" : "1 semana"}`;
    case "send_message": return `Enviar: ${action.body.slice(0, 50)}`;
  }
}

export function macroActionsSummary(actions: MacroAction[]): string {
  return actions.map(macroActionLabel).join(" · ");
}

export function snoozeUntilForPreset(preset: (typeof MACRO_SNOOZE_PRESETS)[number], now = new Date()): Date {
  const date = new Date(now);
  if (preset === "1h") {
    date.setHours(date.getHours() + 1);
  } else if (preset === "tomorrow") {
    date.setDate(date.getDate() + 1);
    date.setHours(9, 0, 0, 0);
  } else {
    date.setDate(date.getDate() + 7);
    date.setHours(9, 0, 0, 0);
  }
  return date;
}
