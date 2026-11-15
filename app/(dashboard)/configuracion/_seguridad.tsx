"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Copy, Download, LogOut, ShieldCheck, ShieldOff, KeyRound } from "lucide-react";
import { SettingsBlock } from "@/app/components/ui/settings-block";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
import { Banner } from "@/app/components/ui/banner";
import { Modal } from "@/app/components/ui/modal";
import { FormField } from "@/app/components/ui/form-field";
import { Input } from "@/app/components/ui/input";
import { PasswordInput } from "@/app/components/ui/password-input";
import { OtpInput } from "@/app/components/ui/otp-input";
import { useToast } from "@/app/components/ui/toast";
import { BRAND_NAME } from "@/lib/brand";

// Seguridad de la cuenta propia (F7): verificación en dos pasos (TOTP + códigos
// de respaldo, lib/two-factor.ts) y "Cerrar las demás sesiones".

type Status = { enabled: boolean; enabledAt: string | null; backupCodesLeft: number };
type Dialog = null | "setup-password" | "setup-scan" | "codes" | "disable" | "regen" | "sessions";

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "No se pudo completar");
  return data;
}

export function SeguridadSection() {
  const { update } = useSession();
  const { success, error: toastError } = useToast();
  const [status, setStatus] = useState<Status | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [setup, setSetup] = useState<{ qrSvg: string; secret: string } | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);

  async function refresh() {
    const res = await fetch("/api/usuarios/me/2fa", { cache: "no-store" });
    if (res.ok) setStatus(await res.json());
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- el setState ocurre tras el fetch
    void refresh();
  }, []);

  function open(next: Dialog) {
    setPassword("");
    setCode("");
    setFormError("");
    setDialog(next);
  }

  function close() {
    setDialog(null);
    setSetup(null);
    setPassword("");
    setCode("");
    setFormError("");
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setFormError("");
    try {
      await action();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "No se pudo completar");
    } finally {
      setBusy(false);
    }
  }

  const startSetup = () =>
    run(async () => {
      const data = await post("/api/usuarios/me/2fa", { action: "setup", password });
      setSetup({ qrSvg: data.qrSvg, secret: data.secret });
      setPassword("");
      setDialog("setup-scan");
    });

  const confirmSetup = () =>
    run(async () => {
      const data = await post("/api/usuarios/me/2fa", { action: "enable", code });
      setSetup(null);
      setBackupCodes(data.backupCodes);
      setDialog("codes");
      await refresh();
      success("Verificación en dos pasos activada");
    });

  const disable = () =>
    run(async () => {
      await post("/api/usuarios/me/2fa", { action: "disable", password, code });
      close();
      await refresh();
      success("Verificación en dos pasos desactivada");
    });

  const regenerate = () =>
    run(async () => {
      const data = await post("/api/usuarios/me/2fa", { action: "backup-codes", password });
      setBackupCodes(data.backupCodes);
      setDialog("codes");
      await refresh();
    });

  const closeOthers = () =>
    run(async () => {
      const data = await post("/api/usuarios/me/sesiones", { password });
      // Esta sesión adopta la versión nueva; las demás caen en ≤ 1 minuto.
      await update({ sessionNonce: data.sessionNonce });
      close();
      success("Listo: las demás sesiones se cerrarán en menos de un minuto");
    });

  const codesText = backupCodes.join("\n");
  function downloadCodes() {
    const blob = new Blob([`Códigos de respaldo de ${BRAND_NAME}\nCada uno sirve una sola vez.\n\n${codesText}\n`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${BRAND_NAME.toLowerCase()}-codigos-de-respaldo.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <SettingsBlock title="Seguridad" description="Verificación en dos pasos y sesiones abiertas.">

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            Verificación en dos pasos
            {status && (status.enabled ? <Badge tone="success" size="sm">Activa</Badge> : <Badge tone="neutral" size="sm">Apagada</Badge>)}
          </p>
          <p className="text-xs text-muted-darker">
            Además de tu contraseña, al iniciar sesión se pide un código de una app autenticadora (Google Authenticator,
            Microsoft Authenticator, 1Password…).
            {status?.enabled && ` Te quedan ${status.backupCodesLeft} códigos de respaldo.`}
          </p>
          {status?.enabled && status.backupCodesLeft <= 2 && (
            <p className="mt-1 text-xs font-medium text-warning">Te quedan pocos códigos de respaldo: genera nuevos.</p>
          )}
        </div>
        {status &&
          (status.enabled ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" icon={KeyRound} onClick={() => open("regen")}>
                Nuevos códigos de respaldo
              </Button>
              <Button size="sm" variant="secondary" icon={ShieldOff} onClick={() => open("disable")}>
                Desactivar
              </Button>
            </div>
          ) : (
            <Button size="sm" icon={ShieldCheck} onClick={() => open("setup-password")}>
              Activar
            </Button>
          ))}
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3 border-t border-border pt-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">Cerrar las demás sesiones</p>
          <p className="text-xs text-muted-darker">
            Saca tu cuenta de cualquier otro navegador o dispositivo en menos de un minuto. Esta sesión sigue abierta.
          </p>
        </div>
        <Button size="sm" variant="secondary" icon={LogOut} onClick={() => open("sessions")}>
          Cerrar las demás
        </Button>
      </div>

      {/* Paso 1 de activar / regenerar / cerrar sesiones: confirmar con la contraseña. */}
      <Modal
        open={dialog === "setup-password" || dialog === "regen" || dialog === "sessions"}
        onClose={close}
        title={dialog === "regen" ? "Nuevos códigos de respaldo" : dialog === "sessions" ? "Cerrar las demás sesiones" : "Activar verificación en dos pasos"}
        description={
          dialog === "regen"
            ? "Los códigos anteriores dejan de servir."
            : dialog === "sessions"
              ? "Confirma con tu contraseña."
              : "Confirma con tu contraseña para empezar."
        }
        footer={
          <>
            <Button variant="secondary" onClick={close}>Cancelar</Button>
            <Button
              loading={busy}
              disabled={!password}
              onClick={dialog === "regen" ? regenerate : dialog === "sessions" ? closeOthers : startSetup}
            >
              Continuar
            </Button>
          </>
        }
      >
        {formError && <Banner tone="danger" className="mb-3">{formError}</Banner>}
        <FormField label="Contraseña actual" required>
          {(id) => <PasswordInput id={id} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" autoFocus />}
        </FormField>
      </Modal>

      {/* Paso 2 de activar: escanear el QR y confirmar el primer código. */}
      <Modal
        open={dialog === "setup-scan"}
        onClose={close}
        persistent
        title="Escanea el código con tu app"
        description="Abre tu app autenticadora, agrega una cuenta y escanea el QR. Luego escribe el código de 6 dígitos que muestra."
        footer={
          <>
            <Button variant="secondary" onClick={close}>Cancelar</Button>
            <Button loading={busy} disabled={code.trim().length < 6} onClick={confirmSetup}>Activar</Button>
          </>
        }
      >
        {formError && <Banner tone="danger" className="mb-3">{formError}</Banner>}
        {setup && (
          <div className="space-y-4">
            <div className="mx-auto w-48 rounded-lg bg-white p-2">
              {/* SVG generado en el servidor por `qrcode` a partir del URI otpauth; como <img>, sin insertar markup. */}
              {/* eslint-disable-next-line @next/next/no-img-element -- data URI generado en runtime */}
              <img src={`data:image/svg+xml;utf8,${encodeURIComponent(setup.qrSvg)}`} alt="Código QR para la app autenticadora" className="h-full w-full" />
            </div>
            <p className="text-center text-xs text-muted-darker">
              ¿No puedes escanear? Escribe esta clave en la app:
              <span className="mt-1 block select-all break-all font-mono text-sm text-foreground">{setup.secret.match(/.{1,4}/g)?.join(" ")}</span>
            </p>
            <OtpInput value={code} onChange={setCode} onComplete={(full) => { setCode(full); }} label="Código de 6 dígitos de la app" />
          </div>
        )}
      </Modal>

      {/* Los códigos de respaldo en claro: única vez que se muestran. */}
      <Modal
        open={dialog === "codes"}
        onClose={close}
        persistent
        title="Guarda tus códigos de respaldo"
        description="Si pierdes el teléfono, cada código te deja entrar una vez. No los volverás a ver."
        footer={<Button onClick={close}>Ya los guardé</Button>}
      >
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-surface-light p-3 font-mono text-sm text-foreground">
          {backupCodes.map((backupCode) => <span key={backupCode}>{backupCode}</span>)}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            icon={Copy}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(codesText);
                success("Códigos copiados");
              } catch {
                toastError("No se pudieron copiar");
              }
            }}
          >
            Copiar
          </Button>
          <Button size="sm" variant="secondary" icon={Download} onClick={downloadCodes}>
            Descargar .txt
          </Button>
        </div>
      </Modal>

      {/* Desactivar: contraseña + un código válido. */}
      <Modal
        open={dialog === "disable"}
        onClose={close}
        title="Desactivar verificación en dos pasos"
        description="Tu cuenta quedará protegida solo con la contraseña."
        footer={
          <>
            <Button variant="secondary" onClick={close}>Cancelar</Button>
            <Button variant="danger" loading={busy} disabled={!password || code.trim().length < 6} onClick={disable}>
              Desactivar
            </Button>
          </>
        }
      >
        {formError && <Banner tone="danger" className="mb-3">{formError}</Banner>}
        <div className="space-y-3">
          <FormField label="Contraseña actual" required>
            {(id) => <PasswordInput id={id} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" autoFocus />}
          </FormField>
          <FormField label="Código de la app o de respaldo" required>
            {(id) => <Input id={id} value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" maxLength={12} className="font-mono" />}
          </FormField>
        </div>
      </Modal>
    </SettingsBlock>
  );
}
