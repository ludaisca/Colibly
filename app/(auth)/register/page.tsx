import { turnstileSiteKey } from "@/lib/turnstile";
import { RegisterForm } from "./_form";

// Envoltorio de servidor: la clave del captcha se lee en runtime (el
// formulario es cliente y no ve variables de entorno sin NEXT_PUBLIC_).
export default function RegisterPage() {
  return <RegisterForm turnstileSiteKey={turnstileSiteKey()} />;
}
