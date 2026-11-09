import { turnstileSiteKey } from "@/lib/turnstile";
import type { Metadata } from "next";
import { RegisterForm } from "./_form";

export const metadata: Metadata = { title: "Crear cuenta" };

// Envoltorio de servidor: la clave del captcha viene de /plataforma (el
// formulario es cliente y no puede leerla directo).
export default async function RegisterPage() {
  return <RegisterForm turnstileSiteKey={await turnstileSiteKey()} />;
}
