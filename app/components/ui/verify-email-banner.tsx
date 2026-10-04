"use client";

import { useState } from "react";
import { MailWarning } from "lucide-react";
import { Button } from "./button";
import { useToast } from "./toast";

// Aviso fijo mientras el correo no esté confirmado: sin confirmar no se pueden
// conectar canales (403 email_unverified en las APIs).
export function VerifyEmailBanner({ email }: { email: string }) {
  const { success, error: toastError } = useToast();
  const [sending, setSending] = useState(false);

  async function resend() {
    setSending(true);
    try {
      const res = await fetch("/api/auth/verify-email/resend", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo reenviar");
      success(`Te enviamos un enlace nuevo a ${email}`);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "No se pudo reenviar");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="shrink-0 border-y border-warning-border bg-warning-bg px-4 py-2.5 md:px-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <MailWarning size={16} className="text-warning shrink-0" aria-hidden />
        <p className="flex-1 min-w-0 text-foreground">
          Confirma tu correo <strong className="break-all">{email}</strong> para conectar tus canales. Revisa tu bandeja de
          entrada.
        </p>
        <Button size="sm" variant="secondary" loading={sending} onClick={resend}>
          Reenviar enlace
        </Button>
      </div>
    </div>
  );
}
