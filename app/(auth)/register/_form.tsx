"use client";

import { useRef, useState } from "react";
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
import { Turnstile } from "@/app/components/ui/turnstile";

// `turnstileSiteKey`: captcha activo (lo decide page.tsx en el servidor con
// lib/turnstile.ts). null = registro sin captcha.
export function RegisterForm({ turnstileSiteKey }: { turnstileSiteKey: string | null }) {
  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resendNotice, setResendNotice] = useState("");
  const [resendError, setResendError] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const [captchaError, setCaptchaError] = useState(false);
  const businessRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

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
      const firstInvalid = (["businessName", "name", "email", "password"] as const).find((field) => fieldErrors[field]);
      if (firstInvalid) {
        const refs = { businessName: businessRef, name: nameRef, email: emailRef, password: passwordRef };
        requestAnimationFrame(() => refs[firstInvalid].current?.focus());
      }
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
        body: JSON.stringify({ name, email, password, businessName, turnstileToken: captchaToken }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al registrar");
      }

      if (analyticsEventId) track({ name: "sign_up", eventId: analyticsEventId });

      // No se inicia sesión: la cuenta queda pendiente de confirmar el correo.
      // El usuario ve el aviso y puede reenviar el enlace desde aquí.
      setRegisteredEmail(parsed.data.email);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Error al registrar");
      // El token ya se gastó en este intento: pedir uno nuevo.
      if (turnstileSiteKey) setCaptchaReset((n) => n + 1);
    } finally {
      setLoading(false);
    }
  }

  async function resendVerification() {
    if (!registeredEmail) return;
    setResending(true);
    setResendNotice("");
    setResendError(false);
    try {
      const res = await fetch("/api/auth/verify-email/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: registeredEmail }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "No se pudo reenviar el enlace");
      setResendNotice(data?.message || "Si la cuenta existe y no está verificada, te enviamos un enlace.");
    } catch (err) {
      setResendError(true);
      setResendNotice(err instanceof Error ? err.message : "No se pudo reenviar el enlace");
    } finally {
      setResending(false);
    }
  }

  if (registeredEmail) {
    return (
      <div className="space-y-6 animate-auth-in">
        <div className="flex justify-center">
          <Logo href="/" size="lg" />
        </div>
        <Card>
          <CardHeader className="mb-2">
            <CardTitle as="h1">Confirma tu correo</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            <Banner tone="success">
              Te enviamos un enlace a <strong>{registeredEmail}</strong>. Ábrelo para activar tu cuenta.
            </Banner>
            <p className="text-sm text-muted-darker">
              Por seguridad, no podrás iniciar sesión hasta confirmarlo. Si no llega en unos minutos, revisa spam o reenvíalo.
            </p>
            <Button type="button" variant="secondary" fullWidth loading={resending} onClick={() => void resendVerification()}>
              Reenviar enlace
            </Button>
            {resendNotice && <Banner tone={resendError ? "danger" : "info"}>{resendNotice}</Banner>}
          </CardBody>
          <CardFooter>
            <p className="text-sm text-muted-darker">
              ¿Ya lo confirmaste?{" "}
              <Link href="/login" className="text-accent-ink underline underline-offset-2">
                Inicia sesión
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-auth-in">
      <div className="flex justify-center">
        <Logo href="/" size="lg" />
      </div>

      <Card>
        <CardHeader className="mb-2">
          <CardTitle as="h1">Crear cuenta</CardTitle>
        </CardHeader>
        <p className="mb-4 text-sm text-muted">14 días gratis con Pro, sin tarjeta.</p>
        <CardBody>
          {serverError && (
            <Banner tone="danger" className="mb-4">
              {serverError}
            </Banner>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField label="Nombre de tu negocio" required error={errors.businessName}>
              {(id, describedBy) => (
                <Input
                  ref={businessRef}
                  id={id}
                  aria-describedby={describedBy}
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Spa Serenidad"
                  autoComplete="organization"
                  error={errors.businessName}
                  showErrorMessage={false}
                />
              )}
            </FormField>

            <FormField label="Nombre completo" required error={errors.name}>
              {(id, describedBy) => (
                <Input
                  ref={nameRef}
                  id={id}
                  aria-describedby={describedBy}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Tu nombre"
                  autoComplete="name"
                  error={errors.name}
                  showErrorMessage={false}
                />
              )}
            </FormField>

            <FormField label="Correo electrónico" required error={errors.email}>
              {(id, describedBy) => (
                <Input
                  ref={emailRef}
                  id={id}
                  aria-describedby={describedBy}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@correo.com"
                  autoComplete="email"
                  error={errors.email}
                  showErrorMessage={false}
                />
              )}
            </FormField>

            <FormField label="Contraseña" required error={errors.password} hint="Mínimo 8 caracteres">
              {(id, describedBy) => (
                <>
                  <PasswordInput
                    ref={passwordRef}
                    id={id}
                    aria-describedby={describedBy}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Crea una contraseña segura"
                    autoComplete="new-password"
                    error={errors.password}
                    showErrorMessage={false}
                  />
                  <PasswordStrength password={password} />
                </>
              )}
            </FormField>

            {turnstileSiteKey && (
              <>
                <Turnstile
                  siteKey={turnstileSiteKey}
                  onToken={setCaptchaToken}
                  onLoadError={() => setCaptchaError(true)}
                  resetKey={captchaReset}
                  className="flex min-h-16 justify-center"
                />
                {captchaError && (
                  <Banner tone="warning">
                    No se pudo cargar la verificación anti-spam. Desactiva el bloqueador de anuncios para este sitio o recarga la página.
                  </Banner>
                )}
              </>
            )}

            <Button type="submit" fullWidth loading={loading} disabled={!!turnstileSiteKey && !captchaToken} icon={UserPlus}>
              Crear cuenta
            </Button>
            <p className="text-center text-xs text-muted-darker">
              Al crear tu cuenta aceptas los{" "}
              <Link href="/terminos" className="text-accent-ink underline underline-offset-2">Términos y condiciones</Link> y el{" "}
              <Link href="/privacidad" className="text-accent-ink underline underline-offset-2">Aviso de privacidad</Link>.
            </p>
          </form>
        </CardBody>
        <CardFooter>
          <p className="text-sm text-muted-darker">
            ¿Ya tienes cuenta?{" "}
            <Link href="/login" className="text-accent-ink underline underline-offset-2">
              Inicia sesión
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
