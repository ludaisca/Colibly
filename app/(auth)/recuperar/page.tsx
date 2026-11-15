"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail } from "lucide-react";
import { Card, CardHeader, CardTitle, CardBody, CardFooter } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { FormField } from "@/app/components/ui/form-field";
import { Banner } from "@/app/components/ui/banner";
import { Logo } from "@/app/components/ui/logo";
import { forgotPasswordSchema } from "@/lib/validations";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [serverError, setServerError] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldError("");
    setServerError("");
    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      if (!res.ok) throw new Error((await res.json()).error || "No se pudo enviar el correo");
      setSent(true);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "No se pudo enviar el correo");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 animate-auth-in">
      <div className="flex justify-center">
        <Logo href="/" size="lg" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle as="h1">Recuperar contraseña</CardTitle>
        </CardHeader>
        <CardBody>
          {sent ? (
            <Banner tone="success">
              Si <strong>{email}</strong> tiene una cuenta, te enviamos un enlace para elegir una contraseña nueva. Vence en
              1 hora; revisa también la carpeta de spam.
            </Banner>
          ) : (
            <>
              {serverError && (
                <Banner tone="danger" className="mb-4">
                  {serverError}
                </Banner>
              )}
              <p className="text-sm text-muted-darker mb-4">
                Escribe el correo con el que entras y te mandaremos un enlace para restablecer tu contraseña.
              </p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <FormField label="Correo electrónico" required error={fieldError}>
                  {(id, describedBy) => (
                    <Input
                      id={id}
                      aria-describedby={describedBy}
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="tu@correo.com"
                      autoComplete="email"
                      error={fieldError}
                    />
                  )}
                </FormField>
                <Button type="submit" fullWidth loading={loading} icon={Mail}>
                  Enviar enlace
                </Button>
              </form>
            </>
          )}
        </CardBody>
        <CardFooter>
          <p className="text-sm text-muted-darker">
            ¿La recordaste?{" "}
            <Link href="/login" className="text-accent-ink underline underline-offset-2">
              Inicia sesión
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
