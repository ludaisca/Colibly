"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { UserPlus } from "lucide-react";
import { Card, CardHeader, CardTitle, CardBody, CardFooter } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { PasswordInput } from "@/app/components/ui/password-input";
import { PasswordStrength } from "@/app/components/ui/password-strength";
import { FormField } from "@/app/components/ui/form-field";
import { Banner } from "@/app/components/ui/banner";
import { Logo } from "@/app/components/ui/logo";
import { registerSchema } from "@/lib/validations";
import { newAnalyticsEventId, track } from "@/lib/analytics/client";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError("");
    setErrors({});

    const parsed = registerSchema.safeParse({ name, email, password, businessName });
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      parsed.error.issues.forEach((i) => {
        fieldErrors[i.path[0] as string] = i.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setLoading(true);
    try {
      // Con consentimiento de cookies, el mismo id viaja al servidor (Conversions
      // API de Meta) y al Pixel del navegador para que Meta cuente un solo registro.
      const analyticsEventId = newAnalyticsEventId();
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(analyticsEventId ? { "x-analytics-event-id": analyticsEventId } : {}) },
        body: JSON.stringify({ name, email, password, businessName }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al registrar");
      }

      if (analyticsEventId) track({ name: "sign_up", eventId: analyticsEventId });

      // Entra directo a su espacio de prueba; el correo de verificación ya va
      // en camino y el aviso superior del panel lo recuerda.
      const login = await signIn("credentials", { email: parsed.data.email, password, redirect: false });
      if (login?.error) {
        router.push("/login");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Error al registrar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex justify-center">
        <Logo href="/" size="lg" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Crear cuenta</CardTitle>
        </CardHeader>
        <CardBody>
          {serverError && (
            <Banner tone="danger" className="mb-4">
              {serverError}
            </Banner>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField label="Nombre de tu negocio" required error={errors.businessName}>
              {(id) => (
                <Input
                  id={id}
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Spa Serenidad"
                  autoComplete="organization"
                  error={errors.businessName}
                />
              )}
            </FormField>

            <FormField label="Nombre completo" required error={errors.name}>
              {(id) => (
                <Input
                  id={id}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Tu nombre"
                  autoComplete="name"
                  error={errors.name}
                />
              )}
            </FormField>

            <FormField label="Email" required error={errors.email}>
              {(id) => (
                <Input
                  id={id}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  autoComplete="email"
                  error={errors.email}
                />
              )}
            </FormField>

            <FormField label="Contraseña" required error={errors.password} hint="Mínimo 8 caracteres">
              {(id) => (
                <>
                  <PasswordInput
                    id={id}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Crea una contraseña segura"
                    autoComplete="new-password"
                    error={errors.password}
                  />
                  <PasswordStrength password={password} />
                </>
              )}
            </FormField>

            <Button type="submit" fullWidth loading={loading} icon={UserPlus}>
              Crear cuenta
            </Button>
            <p className="text-center text-xs text-muted-darker">
              Al crear tu cuenta aceptas los{" "}
              <Link href="/terminos" className="text-accent-ink hover:underline">Términos y condiciones</Link> y el{" "}
              <Link href="/privacidad" className="text-accent-ink hover:underline">Aviso de privacidad</Link>.
            </p>
          </form>
        </CardBody>
        <CardFooter>
          <p className="text-sm text-muted-darker">
            ¿Ya tienes cuenta?{" "}
            <Link href="/login" className="text-accent-ink hover:underline">
              Inicia sesión
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
