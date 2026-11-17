"use client";

import { useState } from "react";
import { Copy, LockKeyhole, RefreshCw, Search, ShieldOff } from "lucide-react";
import { SectionHeader } from "@/app/components/ui/section-header";
import { Card } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
import { Banner } from "@/app/components/ui/banner";
import { Input } from "@/app/components/ui/input";
import { Modal } from "@/app/components/ui/modal";
import { FormField } from "@/app/components/ui/form-field";
import { PageContainer } from "@/app/components/ui/page-container";
import { useToast } from "@/app/components/ui/toast";
import type { PlatformUserView, WhatsAppAccountHealth } from "@/lib/platform/support";
import { canSendLabel, messagingLimitLabel, nameStatusLabel, qualityLabel } from "@/lib/platform/whatsapp-health-rules";

// Soporte del operador: la misma lógica que las herramientas MCP
// colibly_find_user / colibly_reset_two_factor / colibly_whatsapp_health.
// Restablecer contraseña existe solo aquí (el enlace es una credencial: no
// está en la API de tokens ni en el MCP).

type UserRow = Omit<PlatformUserView, "createdAt" | "disabledAt" | "lastSeenAt" | "twoFactor"> & {
  createdAt: string;
  disabledAt: string | null;
  lastSeenAt: string | null;
  twoFactor: { enabled: boolean; enabledAt: string | null; backupCodesLeft: number };
};
type HealthRow = Omit<WhatsAppAccountHealth, "lastActivity"> & { lastActivity: string | null };

const VERDICT: Record<HealthRow["verdict"], { tone: "success" | "warning" | "danger" | "neutral"; label: string }> = {
  ok: { tone: "success", label: "Envía" },
  limited: { tone: "warning", label: "Limitado" },
  blocked: { tone: "danger", label: "Bloqueado" },
  unknown: { tone: "neutral", label: "Sin dato" },
};

function date(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
}

async function readOps<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.ok) throw new Error(body?.error?.message ?? "No se pudo completar la acción");
  return body.data as T;
}

export function PlataformaSoporte() {
  const { success, error: toastError } = useToast();

  const [email, setEmail] = useState("");
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [resetTarget, setResetTarget] = useState<UserRow | null>(null);
  const [reason, setReason] = useState("");
  const [resetting, setResetting] = useState(false);

  const [passwordTarget, setPasswordTarget] = useState<UserRow | null>(null);
  const [passwordReason, setPasswordReason] = useState("");
  const [passwordBusy, setPasswordBusy] = useState<"email" | "link" | null>(null);
  const [resetLink, setResetLink] = useState<{ url: string; expiresAt: string } | null>(null);

  const [orgId, setOrgId] = useState("");
  const [health, setHealth] = useState<HealthRow[] | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  async function searchUsers() {
    if (email.trim().length < 3) return;
    setSearching(true);
    try {
      const data = await readOps<{ items: UserRow[] }>(await fetch(`/api/plataforma/soporte/usuarios?email=${encodeURIComponent(email.trim())}`));
      setUsers(data.items);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "No se pudo buscar");
    } finally {
      setSearching(false);
    }
  }

  async function resetTwoFactor() {
    if (!resetTarget) return;
    setResetting(true);
    try {
      const updated = await readOps<UserRow>(
        await fetch(`/api/plataforma/soporte/usuarios/${resetTarget.id}/2fa`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        })
      );
      setUsers((prev) => prev?.map((u) => (u.id === updated.id ? updated : u)) ?? null);
      success("Verificación en dos pasos quitada y sesiones cerradas");
      setResetTarget(null);
      setReason("");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "No se pudo quitar");
    } finally {
      setResetting(false);
    }
  }

  function closePassword() {
    if (passwordBusy) return;
    setPasswordTarget(null);
    setPasswordReason("");
    setResetLink(null);
  }

  async function resetPassword(mode: "email" | "link") {
    if (!passwordTarget) return;
    setPasswordBusy(mode);
    try {
      const data = await readOps<{ url: string | null; expiresAt: string | null }>(
        await fetch(`/api/plataforma/soporte/usuarios/${passwordTarget.id}/contrasena`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: passwordReason, mode }),
        })
      );
      if (mode === "link" && data.url && data.expiresAt) {
        setResetLink({ url: data.url, expiresAt: data.expiresAt });
      } else {
        success(`Enlace enviado a ${passwordTarget.email}`);
        setPasswordTarget(null);
        setPasswordReason("");
      }
    } catch (err) {
      toastError(err instanceof Error ? err.message : "No se pudo restablecer");
    } finally {
      setPasswordBusy(null);
    }
  }

  async function loadHealth() {
    setHealthLoading(true);
    try {
      const qs = orgId.trim() ? `?organizationId=${encodeURIComponent(orgId.trim())}` : "";
      const data = await readOps<{ items: HealthRow[] }>(await fetch(`/api/plataforma/soporte/whatsapp${qs}`));
      setHealth(data.items);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "No se pudo consultar a Meta");
    } finally {
      setHealthLoading(false);
    }
  }

  return (
    <PageContainer width="6xl">
      <section className="space-y-4">
        <SectionHeader eyebrow="Soporte" title="Buscar usuario" />
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void searchUsers();
          }}
        >
          <Input aria-label="Correo" className="min-w-0 flex-1" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo@empresa.com o parte del correo" />
          <Button type="submit" icon={Search} loading={searching} disabled={email.trim().length < 3}>Buscar</Button>
        </form>
        {users && users.length === 0 && <p className="text-sm text-muted">Sin resultados.</p>}
        <div className="grid gap-2">
          {users?.map((user) => (
            <Card key={user.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="font-medium">{user.name || user.email} <span className="text-sm font-normal text-muted">· {user.email}</span></p>
                  <p className="text-sm text-muted-darker">
                    {user.organization.name} · {user.role}{user.isOwner ? " · dueño" : ""}{user.isPlatformAdmin ? " · operador" : ""}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge size="sm" tone={user.canSignIn ? "success" : "danger"}>{user.canSignIn ? "Puede entrar" : "No puede entrar"}</Badge>
                    {!user.emailVerified && <Badge size="sm" tone="warning">Correo sin verificar</Badge>}
                    {user.disabledAt && <Badge size="sm" tone="danger">Desactivado</Badge>}
                    {user.organization.status === "SUSPENDED" && <Badge size="sm" tone="danger">Organización suspendida</Badge>}
                    <Badge size="sm" tone="neutral">
                      {user.twoFactor.enabled ? `2FA activa · ${user.twoFactor.backupCodesLeft} códigos de respaldo` : "Sin 2FA"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted">Alta {date(user.createdAt)} · última conexión {date(user.lastSeenAt)}</p>
                </div>
                {!user.isPlatformAdmin && (
                  <div className="flex flex-wrap gap-2">
                    {!user.disabledAt && (
                      <Button variant="secondary" size="sm" icon={LockKeyhole} onClick={() => setPasswordTarget(user)}>Contraseña</Button>
                    )}
                    {user.twoFactor.enabled && (
                      <Button variant="secondary" size="sm" icon={ShieldOff} onClick={() => setResetTarget(user)}>Quitar 2FA</Button>
                    )}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeader eyebrow="Meta" title="Salud de WhatsApp" />
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void loadHealth();
          }}
        >
          <Input aria-label="Id de organización" className="min-w-0 flex-1" value={orgId} onChange={(e) => setOrgId(e.target.value)} placeholder="Id de organización (vacío: las 25 cuentas más activas)" />
          <Button type="submit" variant="secondary" icon={RefreshCw} loading={healthLoading}>Consultar a Meta</Button>
        </form>
        {health && health.length === 0 && <p className="text-sm text-muted">No hay cuentas de WhatsApp.</p>}
        <div className="grid gap-2 lg:grid-cols-2">
          {health?.map((row) => (
            <Card key={row.accountId} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="font-medium">{row.name} <span className="text-sm font-normal text-muted">· {row.organization.name}</span></p>
                  {row.meta.reachable ? (
                    <>
                      <p className="text-sm text-muted-darker">
                        {row.meta.phone ?? "—"} · «{row.meta.verifiedName ?? "—"}» nombre {nameStatusLabel(row.meta.nameStatus)}
                      </p>
                      <p className="text-xs text-muted">
                        Envío {canSendLabel(row.meta.canSendMessage)} · calidad {qualityLabel(row.meta.quality)} · límite {messagingLimitLabel(row.meta.messagingLimit)} · fallidos 24 h: {row.failedLast24h}
                      </p>
                      {row.meta.notices.map((notice) => (
                        <p key={notice} className="text-xs text-muted-darker">{notice}</p>
                      ))}
                    </>
                  ) : (
                    <p className="text-sm text-muted-darker">{row.meta.error}</p>
                  )}
                </div>
                <Badge size="sm" tone={VERDICT[row.verdict].tone}>{VERDICT[row.verdict].label}</Badge>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <Modal
        open={!!resetTarget}
        onClose={() => {
          if (resetting) return;
          setResetTarget(null);
          setReason("");
        }}
        title="Quitar la verificación en dos pasos"
        description={resetTarget ? `${resetTarget.email} podrá entrar solo con su contraseña y se cerrarán todas sus sesiones.` : undefined}
        footer={
          <>
            <Button variant="secondary" disabled={resetting} onClick={() => { setResetTarget(null); setReason(""); }}>Cancelar</Button>
            <Button variant="danger" loading={resetting} disabled={reason.trim().length < 5} onClick={() => void resetTwoFactor()}>Quitar 2FA</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Banner tone="warning">Confirma antes la identidad de la persona por otro medio (llamada, correo del dueño de la organización).</Banner>
          <FormField label="Motivo" hint="Queda en la auditoría con tu correo.">{(id) => (
            <Input id={id} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Perdió el teléfono; verificado por llamada con el dueño" />
          )}</FormField>
        </div>
      </Modal>

      <Modal
        open={!!passwordTarget}
        onClose={closePassword}
        persistent={!!resetLink}
        title="Restablecer contraseña"
        description={passwordTarget ? `Para ${passwordTarget.email}. Su contraseña actual sigue funcionando hasta que ponga una nueva; al ponerla se cierran todas sus sesiones.` : undefined}
        footer={
          resetLink ? (
            <Button onClick={closePassword}>Listo</Button>
          ) : (
            <>
              <Button variant="secondary" disabled={!!passwordBusy} onClick={closePassword}>Cancelar</Button>
              <Button variant="secondary" loading={passwordBusy === "link"} disabled={passwordReason.trim().length < 5 || !!passwordBusy} onClick={() => void resetPassword("link")}>Generar enlace</Button>
              <Button loading={passwordBusy === "email"} disabled={passwordReason.trim().length < 5 || !!passwordBusy} onClick={() => void resetPassword("email")}>Enviar por correo</Button>
            </>
          )
        }
      >
        {resetLink ? (
          <div className="space-y-3">
            <Banner tone="info">Este enlace no se vuelve a mostrar. Sirve una sola vez y vence el {date(resetLink.expiresAt)}. Compártelo solo con la persona, por un medio privado.</Banner>
            <p className="select-all break-all rounded-sm bg-surface-light p-2 font-mono text-xs text-foreground">{resetLink.url}</p>
            <Button
              size="sm"
              variant="secondary"
              icon={Copy}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(resetLink.url);
                  success("Enlace copiado");
                } catch {
                  toastError("No se pudo copiar");
                }
              }}
            >
              Copiar enlace
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-darker">
              «Enviar por correo» le manda el mismo enlace que «¿Olvidaste tu contraseña?». Si el correo no le llega, «Generar enlace» te lo muestra a ti para que se lo pases.
            </p>
            <FormField label="Motivo" hint="Queda en la auditoría con tu correo.">{(id) => (
              <Input id={id} value={passwordReason} onChange={(e) => setPasswordReason(e.target.value)} placeholder="No recuerda su contraseña; verificado por llamada" />
            )}</FormField>
          </div>
        )}
      </Modal>
    </PageContainer>
  );
}
