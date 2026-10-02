import { turnstileSiteKey } from "@/lib/turnstile";
import { RegisterForm } from "./_form";

// Envoltorio de servidor: la clave del captcha viene de /plataforma (el
// formulario es cliente y no puede leerla directo).
export default async function RegisterPage() {
  return <RegisterForm turnstileSiteKey={await turnstileSiteKey()} />;
}
