"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { User, Lock, CalendarDays, Brain, ExternalLink, RefreshCw, Unlink, Plug } from "lucide-react";
import { GoogleSheetsButtonIcon, GoogleSheetsIcon, StripeIcon } from "@/app/components/ui/brand-marks";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { PasswordInput } from "@/app/components/ui/password-input";
import { PasswordStrength } from "@/app/components/ui/password-strength";
import { SeguridadSection } from "./_seguridad";
import { FirmaSection } from "./_firma";
import { FormField } from "@/app/components/ui/form-field";
import { Banner } from "@/app/components/ui/banner";
import { Badge } from "@/app/components/ui/badge";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionHeader } from "@/app/components/ui/section-header";
import { Card } from "@/app/components/ui/card";
import { EntityAvatar } from "@/app/components/ui/avatar";
import { ConfirmDialog } from "@/app/components/ui/confirm-dialog";
import { useToast } from "@/app/components/ui/toast";
import { RespuestasRapidasSection } from "./_respuestas-rapidas";
import { CamposPersonalizadosSection } from "./_campos-personalizados";
import { AtributosConversacionSection } from "./_atributos-conversacion";
import { CanalesSection } from "./_canales";

interface GoogleSheetsStatus {
  connected: boolean;
  // false: faltan las credenciales OAuth de Google en el servidor.
  configured?: boolean;
  googleEmail?: string;
  spreadsheetId?: string;
  lastSyncedAt?: string | null;
  lastSyncError?: string | null;
  enabled?: boolean;
}

export default function SettingsPage() {
  const { data: session, update } = useSession();
  const { success, error: toastError } = useToast();

  const user = session?.user;
  const name = user?.name ?? "Usuario";
  const email = user?.email ?? "";

  const [newName, setNewName] = useState("");
  const nameInitialized = useRef(false);
  useEffect(() => {
    if (user && !nameInitialized.current) {
      // La sesión llega después del primer render; evita dejar "Usuario" como
      // valor editable cuando el perfil ya muestra el nombre real.
      setNewName(user.name ?? "Usuario");
      nameInitialized.current = true;
    }
  }, [user]);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [saving, setSaving] = useState(false);

  const [savingName, setSavingName] = useState(false);

  const isAdmin = session?.user?.role === "admin";

  const [googleStatus, setGoogleStatus] = useState<GoogleSheetsStatus>({ connected: false });
  const [loadingGoogleStatus, setLoadingGoogleStatus] = useState(true);
  const [googleStatusError, setGoogleStatusError] = useState<string | null>(null);
  // Se oculta solo cuando sabemos que la plataforma no la tiene configurada.
  const showGoogleSheets = !(googleStatus.configured === false && !googleStatus.connected);
  const [syncingNow, setSyncingNow] = useState(false);
  const [disconnectConfirmOpen, setDisconnectConfirmOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const fetchGoogleStatus = useCallback(() => {
    setLoadingGoogleStatus(true);
    setGoogleStatusError(null);
    fetch("/api/integrations/google-sheets/status")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok || typeof data.connected !== "boolean") throw new Error(data.error ?? "Error al cargar el estado de Google Sheets");
        return data as GoogleSheetsStatus;
      })
      .then((d) => setGoogleStatus(d))
      .catch((error) => setGoogleStatusError(error instanceof Error ? error.message : "Error al cargar el estado de Google Sheets"))
      .finally(() => setLoadingGoogleStatus(false));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; fetchGoogleStatus también se usa para refrescar manualmente
    fetchGoogleStatus();
    // Lectura directa de window.location en vez de useSearchParams para no
    // tener que envolver esta página en Suspense (regla del proyecto para
    // páginas que sí usan ese hook) — aquí solo necesitamos leerlo una vez
    // al montar, tras volver del flujo OAuth.
    const params = new URLSearchParams(window.location.search);
    if (params.get("google_connected") === "1") {
      success("Cuenta de Google conectada correctamente");
      window.history.replaceState({}, "", window.location.pathname);
    } else if (params.get("google_error")) {
      const reason = params.get("google_error");
      toastError(
        reason === "denied"
          ? "Cancelaste la conexión con Google"
          : "No se pudo conectar con Google, intenta de nuevo"
      );
      window.history.replaceState({}, "", window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar, para leer el retorno del OAuth una sola vez
  }, []);

  async function handleSyncNow() {
    setSyncingNow(true);
    try {
      const res = await fetch("/api/integrations/google-sheets/sync-now", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al sincronizar");
      success("Sincronización completada");
      fetchGoogleStatus();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Error al sincronizar");
    } finally {
      setSyncingNow(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      const res = await fetch("/api/integrations/google-sheets/disconnect", { method: "POST" });
      if (!res.ok) throw new Error("Error al desconectar");
      success("Cuenta de Google desconectada");
      setDisconnectConfirmOpen(false);
      fetchGoogleStatus();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Error al desconectar");
    } finally {
      setDisconnecting(false);
    }
  }

  const createdAt = (session?.user as { createdAt?: string })?.createdAt;

  async function handleSaveName() {
    if (!newName.trim()) return;
    setSavingName(true);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Error al guardar");
      }
      await update();
      success("Nombre actualizado");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Error");
    } finally {
      setSavingName(false);
    }
  }

  async function handleSavePassword() {
    setPasswordError("");

    if (!currentPassword) {
      setPasswordError("Ingresa tu contraseña actual");
      return;
    }
    if (!newPassword || newPassword.length < 8) {
      setPasswordError("La nueva contraseña debe tener al menos 8 caracteres");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Las contraseñas no coinciden");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al cambiar contraseña");
      }

      success("Contraseña actualizada correctamente");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Error al cambiar contraseña");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Configuración" description="Administra tu cuenta y preferencias." />

      {/* Índice: en el teléfono la página son ~6 pantallas seguidas. */}
      <nav aria-label="Secciones de la configuración" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 scrollbar-none">
        {[
          { href: "#mi-cuenta", label: "Mi cuenta" },
          ...(isAdmin ? [{ href: "#empresa", label: "Empresa" }] : []),
          { href: "#bandeja", label: "Bandeja" },
          ...(showGoogleSheets ? [{ href: "#google-sheets", label: "Google Sheets" }] : []),
        ].map((item) => (
          <a key={item.href} href={item.href} className="shrink-0 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-surface-light">
            {item.label}
          </a>
        ))}
      </nav>

      <div id="mi-cuenta" className="scroll-mt-4 space-y-6">
      <Card className="flex items-center gap-3">
        <EntityAvatar id={user?.id ?? email} name={name} size="lg" figure seed={user?.id ?? email} />
        <div>
          <h2 className="text-lg font-semibold">{name}</h2>
          <p className="text-sm text-muted-darker">{email}</p>
          <div className="mt-1.5 flex items-center gap-2">
            <Badge tone="info" size="sm">{user?.role === "admin" ? "Administrador" : user?.role === "ejecutivo" ? "Ejecutivo" : "Usuario"}</Badge>
            {createdAt && (
              <span className="flex items-center gap-1 text-xs text-muted-darker">
                <CalendarDays size={11} />
                Miembro desde {new Date(createdAt).toLocaleDateString("es-MX", { year: "numeric", month: "long", timeZone: "America/Mexico_City" })}
              </span>
            )}
          </div>
        </div>
      </Card>

      <Card as="section" className="space-y-4">
        <SectionHeader title="Cuenta" />
        <FormField label="Nombre">
          {(id) => (
            <Input
              id={id}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          )}
        </FormField>
        <Button size="sm" icon={User} onClick={handleSaveName} loading={savingName}>Guardar nombre</Button>
      </Card>

      <Card as="section" className="space-y-4">
        <SectionHeader title="Cambiar contraseña" />
        {passwordError && <Banner tone="danger">{passwordError}</Banner>}

        <FormField label="Contraseña actual" required>
          {(id) => (
            <PasswordInput
              id={id}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          )}
        </FormField>

        <FormField label="Nueva contraseña" required>
          {(id) => (
            <>
              <PasswordInput
                id={id}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                autoComplete="new-password"
              />
              <PasswordStrength password={newPassword} />
            </>
          )}
        </FormField>

        <FormField label="Confirmar nueva contraseña" required>
          {(id) => (
            <PasswordInput
              id={id}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repite la contraseña"
              autoComplete="new-password"
            />
          )}
        </FormField>

        <Button size="sm" icon={Lock} onClick={handleSavePassword} loading={saving}>
          Cambiar contraseña
        </Button>
      </Card>

      <FirmaSection />

      <SeguridadSection />
      </div>

      <div id="empresa" className="scroll-mt-4 space-y-6 empty:hidden">

      {isAdmin && (
        <Card as="section" className="space-y-4">
          <div className="flex items-center gap-2.5">
            <StripeIcon size={22} className="shrink-0" />
            <SectionHeader title="Plan y facturación" className="min-w-0 flex-1" />
          </div>
          <p className="text-sm text-muted">
            Tu plan, el consumo contra sus límites, tus pagos y facturas.
          </p>
          <Button href="/configuracion/plan" variant="secondary" size="sm" icon={StripeIcon}>
            Ver plan
          </Button>
        </Card>
      )}

      {isAdmin && <CanalesSection />}

      {isAdmin && (
        <Card as="section" className="space-y-4">
          <SectionHeader title="IA y operación" />
          <p className="text-sm text-muted">
            Créditos de IA incluidos, horario del negocio, recuperación automática de leads y automatismos de la bandeja.
          </p>
          <Button href="/configuracion/ia" variant="secondary" size="sm" icon={Brain}>
            Configurar
          </Button>
        </Card>
      )}

      {isAdmin && (
        <Card as="section" className="space-y-4">
          <SectionHeader title="API e integraciones" />
          <p className="text-sm text-muted">
            API keys, webhooks salientes y documentación para conectar el CRM con tu ERP, tienda o Zapier/Make.
          </p>
          <Button href="/configuracion/api" variant="secondary" size="sm" icon={Plug}>
            Configurar API
          </Button>
        </Card>
      )}

      </div>

      <div id="bandeja" className="scroll-mt-4 space-y-6">
      <RespuestasRapidasSection />

      <CamposPersonalizadosSection />

      <AtributosConversacionSection />

      <Card as="section" className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <SectionHeader title="Macros" />
          <p className="mt-1 text-sm text-muted">
            Acciones manuales reutilizables para asignar, resolver, priorizar, posponer o responder en un clic.
          </p>
        </div>
        <Button variant="secondary" href="/configuracion/macros">Administrar macros</Button>
      </Card>
      </div>

      {/* Sin configurar en la plataforma no se muestra: una tarjeta que solo
          dice "todavía no está disponible" no le sirve a nadie. */}
      {showGoogleSheets && (
      <Card as="section" id="google-sheets" className="scroll-mt-4 space-y-4">
        <div className="flex items-center gap-2.5">
          <GoogleSheetsIcon size={22} className="shrink-0" />
          <SectionHeader title="Google Sheets" className="min-w-0 flex-1" />
        </div>
        <p className="text-sm text-muted">
          Sincroniza automáticamente tus leads calificados y resultados de campaña a una hoja de Google, cada 15 minutos.
        </p>
        {googleStatusError && <Banner tone="danger" action={<Button type="button" variant="link" size="sm" onClick={fetchGoogleStatus}>Reintentar</Button>}>{googleStatusError}</Banner>}

        {!loadingGoogleStatus && !googleStatusError && !googleStatus.connected && googleStatus.configured !== false && (
          <Button
            size="sm"
            icon={GoogleSheetsButtonIcon}
            // Ruta API que responde 302 hacia el consentimiento OAuth de Google —
            // necesita navegación completa, router.push no sigue redirects externos.
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination
            onClick={() => { window.location.href = "/api/integrations/google-sheets/connect"; }}
          >
            Conectar con Google
          </Button>
        )}

        {!loadingGoogleStatus && !googleStatusError && googleStatus.connected && (
          <div className="space-y-3">
            {googleStatus.lastSyncError && (
              <Banner tone="danger">{googleStatus.lastSyncError}</Banner>
            )}
            <p className="text-sm text-foreground">
              Conectado como <span className="font-medium">{googleStatus.googleEmail}</span>
            </p>
            <p className="text-xs text-muted-darker">
              Última sincronización:{" "}
              {googleStatus.lastSyncedAt
                ? new Date(googleStatus.lastSyncedAt).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })
                : "Nunca"}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {googleStatus.spreadsheetId && (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={ExternalLink}
                  href={`https://docs.google.com/spreadsheets/d/${googleStatus.spreadsheetId}`}
                  external
                >
                  Abrir hoja
                </Button>
              )}
              <Button size="sm" variant="secondary" icon={RefreshCw} onClick={handleSyncNow} loading={syncingNow}>
                Sincronizar ahora
              </Button>
              <Button size="sm" variant="danger" icon={Unlink} onClick={() => setDisconnectConfirmOpen(true)}>
                Desconectar
              </Button>
            </div>
          </div>
        )}
      </Card>
      )}

      <ConfirmDialog
        open={disconnectConfirmOpen}
        onClose={() => setDisconnectConfirmOpen(false)}
        onConfirm={handleDisconnect}
        title="¿Desconectar Google Sheets?"
        description="Se detendrá la sincronización automática. Podrás volver a conectar tu cuenta cuando quieras."
        confirmLabel="Desconectar"
        tone="danger"
        loading={disconnecting}
      />
    </div>
  );
}
