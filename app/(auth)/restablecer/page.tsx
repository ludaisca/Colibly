"use client";

import { Suspense, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound } from "lucide-react";
import { Card, CardHeader, CardTitle, CardBody, CardFooter } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { PasswordInput } from "@/app/components/ui/password-input";
import { PasswordStrength } from "@/app/components/ui/password-strength";
import { FormField } from "@/app/components/ui/form-field";
import { Banner } from "@/app/components/ui/banner";
import { Logo } from "@/app/components/ui/logo";
import { Spinner } from "@/app/components/ui/spinner";

function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError("");
    const next: typeof errors = {};
    if (password.length < 8) next.password = "La contraseña debe tener al menos 8 caracteres";
    if (confirm !== password) next.confirm = "Las contraseñas no coinciden";
    setErrors(next);
    if (Object.keys(next).length) {
      const firstInvalid = next.password ? passwordRef : confirmRef;
      requestAnimationFrame(() => firstInvalid.current?.focus());
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "No se pudo cambiar la contraseña");
      router.push("/login?reset=1");
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "No se pudo cambiar la contraseña");
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
          <CardTitle as="h1">Nueva contraseña</CardTitle>
        </CardHeader>
        <CardBody>
          {!token ? (
            <Banner tone="danger">Falta el enlace. Ábrelo desde el correo que te enviamos o pide uno nuevo.</Banner>
          ) : (
            <>
              {serverError && (
                <Banner tone="danger" className="mb-4">
                  {serverError}
                </Banner>
              )}
              <form onSubmit={handleSubmit} className="space-y-4">
                <FormField label="Contraseña nueva" required error={errors.password} hint="Mínimo 8 caracteres">
                  {(id, describedBy) => (
                    <>
                      <PasswordInput
                        ref={passwordRef}
                        id={id}
                        aria-describedby={describedBy}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="new-password"
                        error={errors.password}
                      />
                      <PasswordStrength password={password} />
                    </>
                  )}
                </FormField>
                <FormField label="Repite la contraseña" required error={errors.confirm}>
                  {(id, describedBy) => (
                    <PasswordInput
                      ref={confirmRef}
                      id={id}
                      aria-describedby={describedBy}
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      autoComplete="new-password"
                      error={errors.confirm}
                    />
                  )}
                </FormField>
                <p className="text-sm text-muted-darker">Al cambiarla se cerrarán tus sesiones abiertas en otros dispositivos.</p>
                <Button type="submit" fullWidth loading={loading} icon={KeyRound}>
                  Guardar contraseña
                </Button>
              </form>
            </>
          )}
        </CardBody>
        <CardFooter>
          <p className="text-sm text-muted-darker">
            ¿El enlace venció?{" "}
            <Link href="/recuperar" className="text-accent-ink underline underline-offset-2">
              Pide uno nuevo
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-16"><Spinner /></div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
