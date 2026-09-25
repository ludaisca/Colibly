"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { UserPlus } from "lucide-react";
import { Card, CardHeader, CardTitle, CardBody, CardFooter } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { PasswordInput } from "@/app/components/ui/password-input";
import { PasswordStrength } from "@/app/components/ui/password-strength";
import { FormField } from "@/app/components/ui/form-field";
import { Banner } from "@/app/components/ui/banner";
import { Logo } from "@/app/components/ui/logo";
import { Spinner } from "@/app/components/ui/spinner";

interface Invitation {
  email: string;
  role: string;
  organizationName: string;
  inviterName: string | null;
}

const ROLE_LABEL: Record<string, string> = { admin: "administrador", user: "usuario", ejecutivo: "ejecutivo" };

function AcceptInvitation() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [loadError, setLoadError] = useState(token ? "" : "Falta el enlace de la invitación.");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ name?: string; password?: string }>({});
  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/auth/invitacion?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json();
        if (res.ok) setInvitation(data);
        else setLoadError(data.error || "La invitación no es válida.");
      })
      .catch(() => setLoadError("No se pudo cargar la invitación. Revisa tu conexión."));
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError("");
    const next: typeof errors = {};
    if (name.trim().length < 2) next.name = "El nombre debe tener al menos 2 caracteres";
    if (password.length < 8) next.password = "La contraseña debe tener al menos 8 caracteres";
    setErrors(next);
    if (Object.keys(next).length || !invitation) return;

    setLoading(true);
    try {
      const res = await fetch("/api/auth/invitacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name, password }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "No se pudo aceptar la invitación");
      const login = await signIn("credentials", { email: invitation.email, password, redirect: false });
      router.push(login?.error ? "/login" : invitation.role === "ejecutivo" ? "/whatsapp/chat" : "/dashboard");
      router.refresh();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "No se pudo aceptar la invitación");
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
          <CardTitle>{invitation ? `Únete a ${invitation.organizationName}` : "Invitación"}</CardTitle>
        </CardHeader>
        <CardBody>
          {loadError ? (
            <Banner tone="danger">{loadError}</Banner>
          ) : !invitation ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-darker mb-4">
                {invitation.inviterName ?? "Un administrador"} te invitó como{" "}
                <strong className="text-foreground">{ROLE_LABEL[invitation.role] ?? invitation.role}</strong>. Entrarás con{" "}
                <strong className="text-foreground">{invitation.email}</strong>.
              </p>
              {serverError && (
                <Banner tone="danger" className="mb-4">
                  {serverError}
                </Banner>
              )}
              <form onSubmit={handleSubmit} className="space-y-4">
                <FormField label="Tu nombre" required error={errors.name}>
                  {(id) => (
                    <Input id={id} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" error={errors.name} />
                  )}
                </FormField>
                <FormField label="Crea tu contraseña" required error={errors.password} hint="Mínimo 8 caracteres">
                  {(id) => (
                    <>
                      <PasswordInput
                        id={id}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="new-password"
                        error={errors.password}
                      />
                      <PasswordStrength password={password} />
                    </>
                  )}
                </FormField>
                <Button type="submit" fullWidth loading={loading} icon={UserPlus}>
                  Aceptar invitación
                </Button>
              </form>
            </>
          )}
        </CardBody>
        <CardFooter>
          <p className="text-sm text-muted-darker">
            ¿Ya tienes cuenta?{" "}
            <Link href="/login" className="text-accent hover:underline">
              Inicia sesión
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}

export default function InvitationPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-16"><Spinner /></div>}>
      <AcceptInvitation />
    </Suspense>
  );
}
