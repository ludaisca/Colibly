import { z } from "zod";

export const betaApplicationSchema = z.object({
  name: z.string().trim().min(2, "Escribe tu nombre").max(80),
  businessName: z.string().trim().min(2, "Escribe el nombre de tu negocio").max(100),
  email: z.string().trim().email("Escribe un correo válido").max(254),
  phone: z.string().trim().min(8, "Escribe tu WhatsApp de contacto").max(30)
    .regex(/^[+()\d\s.-]+$/, "Escribe un número válido"),
  description: z.string().trim().max(400).optional().default(""),
  privacyAccepted: z.literal(true),
  // Campo invisible para bots simples. Si viene lleno, se responde sin enviar.
  website: z.string().max(200).optional().default(""),
});

export type BetaApplication = z.infer<typeof betaApplicationSchema>;
