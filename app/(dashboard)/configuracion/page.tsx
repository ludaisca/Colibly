"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { User, Lock, CalendarDays, Brain, ExternalLink, RefreshCw, Unlink, Plug } from "lucide-react";
import { GoogleSheetsButtonIcon, StripeIcon } from "@/app/components/ui/brand-marks";
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
import { EntityAvatar } from "@/app/components/ui/avatar";
import { ConfirmDialog } from "@/app/components/ui/confirm-dialog";
import { useToast } from "@/app/components/ui/toast";
import { RespuestasRapidasSection } from "./_respuestas-rapidas";
import { CamposPersonalizadosSection } from "./_campos-personalizados";
import { AtributosConversacionSection } from "./_atributos-conversacion";
import { CanalesSection } from "./_canales";
import { HorarioNegocioCard } from "./_horario";
import { EtiquetasSection } from "./_etiquetas";
import { SettingsBlock } from "@/app/components/ui/settings-block";
import { useRunOnChange } from "@/app/components/ui/use-run-on-change";

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
  // El error de nombre vacío sale cuando la persona lo borra, no mientras carga.
  const [nameTouched, setNameTouched] = useState(false);
  const nameError = nameTouched && !newName.trim() ? "Escribe tu nombre" : undefined;
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

  useRunOnChange(() => {
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
      setNameTouched(false);
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

  // Subnavegación (QA-022): secciones de esta página y las que tienen la suya.
  const sections = [
    { href: "#cuenta", label: "Cuenta" },
    ...(isAdmin ? [{ href: "/usuarios", label: "Equipo" }] : []),
    ...(isAdmin ? [{ href: "#canales", label: "Canales" }] : []),
    ...(isAdmin ? [{ href: "/configuracion/ia", label: "IA" }] : []),
    ...(isAdmin ? [{ href: "#horario", label: "Horario" }] : []),
    { href: "#respuestas", label: "Respuestas rápidas" },
    { href: "#campos", label: "Campos" },
    ...(isAdmin ? [{ href: "#etiquetas", label: "Etiquetas" }] : []),
    ...(isAdmin || showGoogleSheets ? [{ href: "#api", label: "API" }] : []),
    ...(isAdmin ? [{ href: "/configuracion/plan", label: "Plan" }] : []),
  ];
  const nameDirty = nameTouched && newName.trim() !== (user?.name ?? "").trim();

  return (
    <div className="space-y-4">
      <PageHeader title="Configuración" />

      <div className="grid gap-6 md:grid-cols-[200px_minmax(0,1fr)]">
        {/* Escritorio: menú fijo a la izquierda. Teléfono: lista que lleva a
            cada sección (nada de pestañas cortadas). */}
        <nav aria-label="Secciones de la configuración" className="md:sticky md:top-4 md:self-start">
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface md:divide-y-0 md:rounded-none md:border-0 md:bg-transparent">
            {sections.map((item) => (
              <li key={item.href}>
                <a href={item.href} className="flex h-11 items-center justify-between px-3 text-sm font-medium text-foreground md:h-[30px] md:rounded-sm md:px-2.5 md:text-muted md:hover:bg-surface-light md:hover:text-foreground">
                  {item.label}
                  <span aria-hidden className="text-muted-darker md:hidden">›</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="max-w-3xl min-w-0">
          <SettingsBlock id="cuenta" title="Cuenta" description="Tu nombre y cómo te ve el equipo.">
            <div className="flex items-center gap-3">
              <EntityAvatar id={user?.id ?? email} name={name} size="lg" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{email}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Badge tone="neutral" size="sm">{user?.role === "admin" ? "Administrador" : user?.role === "ejecutivo" ? "Ejecutivo" : "Usuario"}</Badge>
                  {createdAt && (
                    <span className="flex items-center gap-1 text-xs text-muted-darker">
                      <CalendarDays size={12} aria-hidden />
                      Miembro desde {new Date(createdAt).toLocaleDateString("es-MX", { year: "numeric", month: "long", timeZone: "America/Mexico_City" })}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <FormField label="Nombre" required error={nameError}>
              {(id, describedBy) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  value={newName}
                  error={nameError}
                  onChange={(e) => { setNewName(e.target.value); setNameTouched(true); }}
                />
              )}
            </FormField>
          </SettingsBlock>

          <SettingsBlock title="Contraseña" description="Cámbiala cuando quieras; cierra la sesión en otros equipos desde Seguridad.">
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

            <Button size="sm" variant="secondary" icon={Lock} onClick={handleSavePassword} loading={saving}>
              Cambiar contraseña
            </Button>
          </SettingsBlock>

          <FirmaSection />
          <SeguridadSection />

          {isAdmin && (
            <div id="canales" className="scroll-mt-4">
              <CanalesSection />
            </div>
          )}
          {isAdmin && (
            <div id="horario" className="scroll-mt-4">
              <HorarioNegocioCard />
            </div>
          )}

          <div id="respuestas" className="scroll-mt-4">
            <RespuestasRapidasSection />
            <SettingsBlock title="Macros" description="Acciones manuales para asignar, resolver, priorizar, posponer o responder en un clic.">
              <Button variant="secondary" size="sm" href="/configuracion/macros">Administrar macros</Button>
            </SettingsBlock>
          </div>

          <div id="campos" className="scroll-mt-4">
            <CamposPersonalizadosSection />
            <AtributosConversacionSection />
          </div>

          {isAdmin && <EtiquetasSection />}

          <div id="api" className="scroll-mt-4">
            {isAdmin && (
              <SettingsBlock title="API e integraciones" description="API keys, webhooks y documentación para conectar tu ERP, tienda, n8n o Zapier.">
                <Button href="/configuracion/api" variant="secondary" size="sm" icon={Plug}>Configurar API</Button>
              </SettingsBlock>
            )}
      {showGoogleSheets && (
      <SettingsBlock id="google-sheets" title="Google Sheets" description="Sincroniza tus contactos calificados y resultados de campaña a una hoja de Google cada 15 minutos.">
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
      </SettingsBlock>
      )}

          </div>

          {isAdmin && (
            <SettingsBlock title="Plan y facturación" description="Tu plan, el consumo contra sus límites, pagos y facturas.">
              <Button href="/configuracion/plan" variant="secondary" size="sm" icon={StripeIcon}>Ver plan</Button>
            </SettingsBlock>
          )}
          {isAdmin && (
            <SettingsBlock title="IA y operación" description="Créditos de IA, recuperación automática de contactos y automatismos de la bandeja.">
              <Button href="/configuracion/ia" variant="secondary" size="sm" icon={Brain}>Configurar</Button>
            </SettingsBlock>
          )}
        </div>
      </div>

      {/* Guardado por sección: el nombre muestra una barra fija mientras tenga cambios. */}
      {nameDirty && (
        <div role="region" aria-label="Cambios sin guardar" className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pb-[env(safe-area-inset-bottom,0px)] md:left-[var(--sidebar-w,260px)]">
          <div className="flex max-w-3xl items-center gap-3 px-4 py-3 md:px-6">
            <p className="min-w-0 flex-1 text-sm font-medium">Cambios sin guardar</p>
            <Button variant="ghost" size="sm" onClick={() => { setNewName(user?.name ?? ""); setNameTouched(false); }}>Descartar</Button>
            <Button size="sm" icon={User} onClick={handleSaveName} loading={savingName} disabled={!newName.trim()}>Guardar</Button>
          </div>
        </div>
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
