"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { LogIn, ShieldCheck, ArrowLeft } from "lucide-react";
import { Card, CardHeader, CardTitle, CardBody, CardFooter } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { FormField } from "@/app/components/ui/form-field";
import { Banner } from "@/app/components/ui/banner";
import { Logo } from "@/app/components/ui/logo";
import { Spinner } from "@/app/components/ui/spinner";
import { loginSchema } from "@/lib/validations";
import { OtpInput } from "@/app/components/ui/otp-input";
import { TWO_FACTOR_INVALID_CODE, TWO_FACTOR_RATE_LIMITED_CODE, TWO_FACTOR_REQUIRED_CODE } from "@/lib/auth-policy";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl");
  const notice = searchParams.get("reset") === "1" ? "Listo, tu contraseña cambió. Inicia sesión con la nueva." : null;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);
  const [unverified, setUnverified] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendNotice, setResendNotice] = useState("");
  const [resendError, setResendError] = useState(false);
  // Segundo paso: la contraseña ya fue correcta y la cuenta tiene verificación
  // en dos pasos. El código viaja junto con email y contraseña en el mismo
  // signIn (lib/auth.ts); nada se guarda fuera de este formulario.
  const [needsCode, setNeedsCode] = useState(false);
  const [code, setCode] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);

  async function handleSubmit(e: React.FormEvent | null, codeOverride?: string) {
    e?.preventDefault();
    if (loading) return;
    const typedCode = codeOverride ?? code;
    setServerError("");
    setErrors({});
    setUnverified(false);
    setResendNotice("");
    setResendError(false);

    if (needsCode && !typedCode.trim()) {
      setServerError("Escribe el código de tu app autenticadora o un código de respaldo.");
      return;
    }

    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      parsed.error.issues.forEach((i) => {
        fieldErrors[i.path[0] as string] = i.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setLoading(true);
    const result = await signIn("credentials", {
      email,
      password,
      ...(needsCode ? { code: typedCode.trim() } : {}),
      redirect: false,
    });
    setLoading(false);

    if (result?.error) {
      if (result.code === TWO_FACTOR_REQUIRED_CODE) {
        setNeedsCode(true);
        return;
      }
      if (result.code === TWO_FACTOR_INVALID_CODE) {
        setCode("");
        setServerError("Código incorrecto o ya usado. Escribe el código nuevo de tu app.");
        return;
      }
      if (result.code === TWO_FACTOR_RATE_LIMITED_CODE) {
        setServerError("Demasiados intentos. Espera unos minutos antes de volver a intentar.");
        return;
      }
      if (result.code === "email_not_verified") {
        setUnverified(true);
        setServerError("Tu correo aún no está confirmado. Revisa tu bandeja de entrada (y spam).");
        return;
      }
      setServerError("Email o contraseña incorrectos.");
      return;
    }

    router.push(callbackUrl || "/dashboard");
    router.refresh();
  }

  async function resendVerification() {
    if (!email.trim()) return;
    setResending(true);
    setResendNotice("");
    setResendError(false);
    try {
      const res = await fetch("/api/auth/verify-email/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
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

  return (
    <div className="space-y-6 animate-auth-in">
      <div className="flex justify-center">
        <Logo href="/" size="lg" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Iniciar sesión</CardTitle>
        </CardHeader>
        <CardBody>
          {serverError ? (
            <Banner tone="danger" className="mb-4">
              {serverError}
            </Banner>
          ) : notice ? (
            <Banner tone="success" className="mb-4">
              {notice}
            </Banner>
          ) : null}
          {unverified && (
            <div className="mb-4 space-y-2">
              <Button type="button" variant="secondary" size="sm" fullWidth loading={resending} onClick={() => void resendVerification()}>
                Reenviar enlace de confirmación
              </Button>
              {resendNotice && <Banner tone={resendError ? "danger" : "info"}>{resendNotice}</Banner>}
            </div>
          )}
          {needsCode ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg bg-accent-subtle p-3 text-sm text-accent-ink">
                <ShieldCheck size={18} className="mt-0.5 shrink-0" aria-hidden />
                <p>Tu cuenta tiene verificación en dos pasos. Abre tu app autenticadora y escribe el código de 6 dígitos.</p>
              </div>
              {useBackupCode ? (
                <FormField label="Código de respaldo" required hint="Uno de los 10 códigos que guardaste al activar la verificación.">
                  {(id) => (
                    <Input
                      id={id}
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      autoComplete="off"
                      autoFocus
                      maxLength={12}
                      placeholder="xxxx-xxxx"
                      className="font-mono tracking-widest"
                    />
                  )}
                </FormField>
              ) : (
                // Casillas de Tesela (tsl-otp): al llenar la sexta se envía solo.
                <OtpInput
                  value={code}
                  onChange={setCode}
                  onComplete={(full) => void handleSubmit(null, full)}
                  autoFocus
                  disabled={loading}
                  invalid={!!serverError}
                />
              )}
              <button
                type="button"
                onClick={() => {
                  setUseBackupCode((v) => !v);
                  setCode("");
                  setServerError("");
                }}
                className="block w-full text-center text-sm text-accent-ink hover:underline"
              >
                {useBackupCode ? "Usar el código de la app" : "¿Sin teléfono? Usa un código de respaldo"}
              </button>
              <Button type="submit" fullWidth loading={loading} icon={ShieldCheck}>
                Verificar
              </Button>
              <button
                type="button"
                onClick={() => {
                  setNeedsCode(false);
                  setUseBackupCode(false);
                  setCode("");
                  setPassword("");
                  setServerError("");
                }}
                className="inline-flex items-center gap-1 text-sm text-muted-darker hover:text-foreground"
              >
                <ArrowLeft size={14} aria-hidden /> Usar otra cuenta
              </button>
            </form>
          ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
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

            <FormField label="Contraseña" required error={errors.password}>
              {(id) => (
                <Input
                  id={id}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Tu contraseña"
                  autoComplete="current-password"
                  error={errors.password}
                />
              )}
            </FormField>

            <div className="flex justify-end -mt-1">
              <Link href="/recuperar" className="text-sm text-accent-ink underline underline-offset-2">
                ¿Olvidaste tu contraseña?
              </Link>
            </div>

            <Button type="submit" fullWidth loading={loading} icon={LogIn}>
              Ingresar
            </Button>
          </form>
          )}
        </CardBody>
        <CardFooter>
          <p className="text-sm text-muted-darker">
            ¿No tienes cuenta?{" "}
            <Link href="/register" className="text-accent-ink underline underline-offset-2">
              Regístrate
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="space-y-6">
        <div className="flex justify-center"><Logo href="/" size="lg" /></div>
        <div className="flex items-center justify-center py-10"><Spinner /></div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
