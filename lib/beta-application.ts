import { z } from "zod";

const phoneDigits = (value: string) => value.replace(/\D/g, "").length;

export const betaApplicationSchema = z.object({
  name: z.string().trim().min(2, "Escribe tu nombre").max(80, "Usa 80 caracteres o menos"),
  businessName: z.string().trim().min(2, "Escribe el nombre de tu negocio").max(100, "Usa 100 caracteres o menos"),
  email: z.string().trim().email("Escribe un correo válido").max(254, "Escribe un correo válido"),
  phone: z.string().trim().min(1, "Escribe tu WhatsApp de contacto").max(30, "Escribe un número válido")
    .regex(/^[+()\d\s.-]+$/, "Usa solo números y los signos + ( ) . -")
    // Cuenta dígitos, no caracteres: "(55) 12" no es un teléfono aunque mida 8.
    .refine((value) => phoneDigits(value) >= 8 && phoneDigits(value) <= 15, "Revisa el número: incluye la lada, por ejemplo 55 1234 5678"),
  description: z.string().trim().max(400, "Usa 400 caracteres o menos").optional().default(""),
  privacyAccepted: z.literal(true, { error: "Marca la casilla de aceptación para enviar tu solicitud" }),
  // Campo invisible para bots simples. Si viene lleno, se responde sin enviar.
  website: z.string().max(200).optional().default(""),
});

export type BetaApplication = z.infer<typeof betaApplicationSchema>;
