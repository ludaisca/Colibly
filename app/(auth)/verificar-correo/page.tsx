"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card, CardHeader, CardTitle, CardBody } from "@/app/components/ui/card";
import { Banner } from "@/app/components/ui/banner";
import { Logo } from "@/app/components/ui/logo";
import { Spinner } from "@/app/components/ui/spinner";
import { BRAND_NAME } from "@/lib/brand";

type State = { status: "loading" } | { status: "ok" } | { status: "error"; message: string };

function VerifyEmail() {
  const token = useSearchParams().get("token") ?? "";
  const [state, setState] = useState<State>(token ? { status: "loading" } : { status: "error", message: "Falta el enlace de verificación." });
  // El enlace es de un solo uso: en desarrollo React monta dos veces el efecto
  // y la segunda llamada vería el token ya consumido.
  const sent = useRef(false);

  useEffect(() => {
    if (!token || sent.current) return;
    sent.current = true;
    fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        if (res.ok) setState({ status: "ok" });
        else setState({ status: "error", message: (await res.json()).error || "No se pudo confirmar el correo." });
      })
      .catch(() => setState({ status: "error", message: "No se pudo confirmar el correo. Revisa tu conexión." }));
  }, [token]);

  return (
    <div className="space-y-6 animate-auth-in">
      <div className="flex justify-center">
        <Logo href="/" size="lg" />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Confirmar correo</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          {state.status === "loading" && (
            <div className="flex items-center gap-3 text-sm text-muted-darker">
              <Spinner /> Confirmando tu correo…
            </div>
          )}
          {state.status === "ok" && <Banner tone="success">¡Listo! Tu correo quedó confirmado.</Banner>}
          {state.status === "error" && <Banner tone="danger">{state.message}</Banner>}
          {state.status !== "loading" && (
            <p className="text-sm">
              <Link href="/dashboard" className="text-accent-ink underline underline-offset-2">
                Ir a {BRAND_NAME}
              </Link>
            </p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-16"><Spinner /></div>}>
      <VerifyEmail />
    </Suspense>
  );
}
