"use client";

import { formatInZone } from "@/lib/format/dates";
import { useState, useEffect, useCallback } from "react";
import { BadgeCheck, Mail, RotateCw, Shield, ShieldOff, UserPlus, Users, UserX, UserCheck, X, KeyRound } from "lucide-react";
import type { PlanId } from "@prisma/client";
import { LICENSE_ORDER } from "@/lib/billing/licenses";
import { PLANS } from "@/lib/billing/plans";
import { useSession } from "next-auth/react";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Spinner } from "@/app/components/ui/spinner";
import { PageHeader } from "@/app/components/ui/page-header";
import { EntityList, EntityRow } from "@/app/components/ui/entity-list";
import { EntityAvatar } from "@/app/components/ui/avatar";
import { useToast } from "@/app/components/ui/toast";
import { ConfirmDialog } from "@/app/components/ui/confirm-dialog";
import { Banner } from "@/app/components/ui/banner";
import { SectionHeader } from "@/app/components/ui/section-header";
import { UserFormModal } from "./_form";
import { InviteFormModal } from "./_invite";
import { LicenseModal } from "./_license";
import { useLicenseState } from "./_licenses";
import { TeamsSection } from "./_teams";
import { plural } from "@/lib/format/plural";

interface UserData {
  id: string;
  name: string | null;
  email: string;
  role: string;
  disabledAt: string | null;
  createdAt: string;
  waAccounts: Array<{ id: string; name: string }>;
  ownedWaAccounts: Array<{ id: string; name: string }>;
  ownedChannelAccounts: Array<{ id: string; name: string; channel: string }>;
  license: PlanId;
  aiCreditsUsed: number;
  isOwner: boolean;
  twoFactorEnabled: boolean;
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  license: PlanId | null;
  createdAt: string;
  expiresAt: string;
  invitedBy: { name: string | null; email: string } | null;
}

const ROLE_LABEL: Record<string, string> = { admin: "Administrador", user: "Usuario", ejecutivo: "Ejecutivo" };
const LICENSE_TONE: Record<PlanId, "neutral" | "info" | "accent"> = { ESSENTIAL: "neutral", BUSINESS: "info", PRO: "accent" };

export default function UsersPage() {
  const { success, error: toastError } = useToast();
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState<UserData | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [invitationLoadError, setInvitationLoadError] = useState<string | null>(null);
  const [invitationBusy, setInvitationBusy] = useState<string | null>(null);
  const { state: licenses, reload: reloadLicenses } = useLicenseState();
  const [licenseUser, setLicenseUser] = useState<UserData | null>(null);

  const fetchInvitations = useCallback(async () => {
    setInvitationLoadError(null);
    try {
      const res = await fetch("/api/usuarios/invitaciones");
      const data = await res.json();
      if (!res.ok || !Array.isArray(data)) throw new Error(data.error ?? "No se pudieron cargar las invitaciones");
      setInvitations(data);
    } catch (error) {
      setInvitationLoadError(error instanceof Error ? error.message : "No se pudieron cargar las invitaciones");
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
  useEffect(() => { fetchInvitations(); }, [fetchInvitations]);

  const resendInvitation = useCallback(async (inv: Invitation) => {
    setInvitationBusy(inv.id);
    try {
      const res = await fetch("/api/usuarios/invitaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inv.email, role: inv.role, ...(inv.license ? { license: inv.license } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      success(`Invitación reenviada a ${inv.email}`);
      await fetchInvitations();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "No se pudo reenviar");
    } finally {
      setInvitationBusy(null);
    }
  }, [success, toastError, fetchInvitations]);

  const revokeInvitation = useCallback(async (inv: Invitation) => {
    setInvitationBusy(inv.id);
    try {
      const res = await fetch(`/api/usuarios/invitaciones/${inv.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      success("Invitación revocada");
      setInvitations((prev) => prev.filter((i) => i.id !== inv.id));
    } catch (err) {
      toastError(err instanceof Error ? err.message : "No se pudo revocar");
    } finally {
      setInvitationBusy(null);
    }
  }, [success, toastError]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/usuarios");
      const data = await res.json();
      if (Array.isArray(data)) setUsers(data);
      else throw new Error(data.error ?? "Error al cargar usuarios");
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Error al cargar usuarios");
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; fetchUsers also used for manual refresh
  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const toggleRole = useCallback(async (userId: string, currentRole: string) => {
    setTogglingId(userId);
    const cycle: Record<string, string> = { user: "ejecutivo", ejecutivo: "admin", admin: "user" };
    const newRole = cycle[currentRole] ?? "user";
    try {
      const res = await fetch("/api/usuarios", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const labels: Record<string, string> = { admin: "Administrador", user: "Usuario", ejecutivo: "Ejecutivo" };
      success(`Rol actualizado a ${labels[newRole]}`);
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
      );
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Error");
    } finally {
      setTogglingId(null);
    }
  }, [success, toastError]);

  // Recuperación: un miembro perdió el teléfono y sus códigos de respaldo.
  // Quita su verificación en dos pasos y cierra sus sesiones (lib/two-factor.ts).
  const { data: session } = useSession();
  const [confirmReset2fa, setConfirmReset2fa] = useState<UserData | null>(null);
  const resetTwoFactor = useCallback(async (user: UserData) => {
    setTogglingId(user.id);
    try {
      const res = await fetch("/api/usuarios", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, resetTwoFactor: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      success("Verificación en dos pasos quitada; ya puede entrar solo con su contraseña");
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, twoFactorEnabled: false } : u)));
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Error");
    } finally {
      setTogglingId(null);
      setConfirmReset2fa(null);
    }
  }, [success, toastError]);

  // Desactivar corta el acceso de inmediato (login rechazado y sesiones
  // vigentes invalidadas en ≤ 60 s) sin borrar sus datos ni su historial.
  const setDisabled = useCallback(async (user: UserData, disabled: boolean) => {
    setTogglingId(user.id);
    try {
      const res = await fetch("/api/usuarios", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, disabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      success(disabled ? "Usuario desactivado" : "Usuario reactivado");
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, disabledAt: data.disabledAt } : u)));
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Error");
    } finally {
      setTogglingId(null);
      setConfirmDisable(null);
    }
  }, [success, toastError]);

  function nextRoleLabel(role: string): string {
    const labels: Record<string, string> = { user: "Ejecutivo", ejecutivo: "Administrador", admin: "Usuario" };
    return labels[role] ?? "Usuario";
  }

  function nextRoleIcon(role: string) {
    return role === "admin" ? ShieldOff : Shield;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Usuarios"
        description="Tu equipo y sus roles en este espacio."
        actions={
          <>
            <Button icon={UserPlus} size="sm" variant="secondary" onClick={() => setShowCreate(true)}>
              Crear con contraseña
            </Button>
            <Button icon={Mail} size="sm" onClick={() => setShowInvite(true)}>
              Invitar
            </Button>
          </>
        }
      />

      {licenses && licenses.mode === "license" && !licenses.isInternal && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-border bg-surface px-4 py-3 text-sm">
          <span className="font-medium">Licencias</span>
          {[...LICENSE_ORDER].reverse().map((p) => (
            <span key={p} className="tabular-nums text-muted">
              {PLANS[p].name}:{" "}
              <span className={licenses.overAssigned[p] > 0 && licenses.hasSubscription ? "font-semibold text-danger" : "font-semibold text-foreground"}>{licenses.assigned[p]}</span>
              {licenses.trialing && !licenses.hasSubscription ? " asignadas" : ` de ${licenses.purchased[p]}`}
            </span>
          ))}
          <a href="/configuracion/plan#licencias" className="ml-auto text-accent-ink underline underline-offset-2">
            {licenses.trialing && !licenses.hasSubscription ? `Prueba: hasta ${licenses.trialMaxUsers} personas` : "Contratar licencias"}
          </a>
        </div>
      )}
      {licenses && licenses.mode === "legacy" && (
        <Banner tone="info">
          Tu organización conserva el plan anterior
          {licenses.legacyUntil ? ` hasta el ${formatInZone(licenses.legacyUntil, { day: "numeric", month: "long" })}` : ""}. Para elegir la licencia de cada persona,{" "}
          <a href="/configuracion/plan#licencias" className="font-medium underline underline-offset-2">pásate a licencias</a>.
        </Banner>
      )}

      {invitationLoadError && <Banner tone="danger" action={<Button type="button" variant="link" size="sm" onClick={fetchInvitations}>Reintentar</Button>}>{invitationLoadError}</Banner>}

      {invitations.length > 0 && (
        <section className="space-y-3">
          <SectionHeader eyebrow="Pendientes" title="Invitaciones enviadas" />
          <EntityList
            rows={invitations}
            rowKey={(i) => i.id}
            emptyIcon={Mail}
            emptyTitle="Sin invitaciones"
            rowClassName="flex-col items-stretch sm:flex-row sm:items-center"
            renderRow={(inv) => (
              <>
                <EntityRow
                  leading={<EntityAvatar id={inv.email} name={inv.email} size="sm" figure />}
                  title={<span className="font-mono">{inv.email}</span>}
                  badges={
                    <>
                      <Badge tone="neutral" size="sm">{ROLE_LABEL[inv.role] ?? inv.role}</Badge>
                      {inv.license && <Badge tone={LICENSE_TONE[inv.license]} size="sm">{PLANS[inv.license].name}</Badge>}
                    </>
                  }
                  subtitle={`Vence el ${formatInZone(inv.expiresAt, { day: "2-digit", month: "short" })}${inv.invitedBy ? ` · la envió ${inv.invitedBy.name ?? inv.invitedBy.email}` : ""}`}
                />
                <span className="flex shrink-0 items-center justify-end gap-1 border-t border-border pt-2 sm:border-0 sm:pt-0">
                  <Button variant="ghost" size="sm" icon={RotateCw} disabled={invitationBusy === inv.id} onClick={() => resendInvitation(inv)}>
                    Reenviar
                  </Button>
                  <Button variant="ghost" size="sm" icon={X} disabled={invitationBusy === inv.id} onClick={() => revokeInvitation(inv)} className="text-danger">
                    Revocar
                  </Button>
                </span>
              </>
            )}
          />
        </section>
      )}

      <p className="text-sm text-muted-darker">Miembros del equipo ({users.length})</p>

      <EntityList
        rows={users}
        rowKey={(u) => u.id}
        loading={loading}
        error={fetchError}
        onRetry={fetchUsers}
        emptyIcon={Users}
        emptyTitle="Sin usuarios"
        emptyDescription="Invita a tu equipo para que atienda conversaciones contigo."
        rowClassName="flex-col items-stretch sm:flex-row sm:items-center"
        renderRow={(u) => (
          <>
            <EntityRow
              leading={<EntityAvatar id={u.id} name={u.name ?? u.email} size="sm" figure seed={u.id} />}
              title={u.name ?? "—"}
              badges={
                <>
                  <Badge tone="neutral" size="sm">
                    {u.role === "admin" ? "Administrador" : u.role === "ejecutivo" ? "Ejecutivo" : "Usuario"}
                  </Badge>
                  <Badge tone={LICENSE_TONE[u.license]} size="sm">{PLANS[u.license].name}</Badge>
                  {u.isOwner && <Badge tone="accent" size="sm">Titular</Badge>}
                  {u.disabledAt && <Badge tone="danger" size="sm">Desactivado</Badge>}
                  {u.twoFactorEnabled && <Badge tone="success" size="sm">2 pasos</Badge>}
                </>
              }
              subtitle={
                <>
                  <span className="font-mono">{u.email}</span> · {u.ownedWaAccounts.length + u.ownedChannelAccounts.length === 0 ? "sin canales propios" : `titular de ${plural(u.ownedWaAccounts.length + u.ownedChannelAccounts.length, "canal", "canales")}`}
                </>
              }
              meta={
                <span className="font-mono">
                  {formatInZone(u.createdAt, { day: "2-digit", month: "short", year: "numeric" })}
                </span>
              }
            />
            {licenses?.mode !== "legacy" && (
              <span className="flex shrink-0 items-center justify-end border-t border-border pt-2 sm:border-0 sm:pt-0">
                <Button variant="ghost" size="sm" icon={BadgeCheck} onClick={() => setLicenseUser(u)} className="text-muted-darker">
                  Licencia
                </Button>
              </span>
            )}
            {u.twoFactorEnabled && u.id !== session?.user?.id && (
              <span className="flex shrink-0 items-center justify-end border-t border-border pt-2 sm:border-0 sm:pt-0">
                <Button variant="ghost" size="sm" icon={KeyRound} onClick={() => setConfirmReset2fa(u)} disabled={togglingId === u.id} className="text-muted-darker">
                  Quitar 2 pasos
                </Button>
              </span>
            )}
            {!u.isOwner && <span className="flex shrink-0 items-center justify-end gap-1 border-t border-border pt-2 sm:border-0 sm:pt-0">
              <Button
                variant="ghost"
                size="sm"
                icon={nextRoleIcon(u.role)}
                onClick={() => toggleRole(u.id, u.role)}
                disabled={togglingId === u.id || !!u.disabledAt}
                className={u.role === "admin" ? "text-warning" : "text-muted-darker"}
              >
                {togglingId === u.id ? <Spinner /> : `Hacer ${nextRoleLabel(u.role)}`}
              </Button>
              {u.disabledAt ? (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={UserCheck}
                  onClick={() => setDisabled(u, false)}
                  disabled={togglingId === u.id}
                  className="text-success"
                >
                  Reactivar
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={UserX}
                  onClick={() => setConfirmDisable(u)}
                  disabled={togglingId === u.id}
                  className="text-danger"
                >
                  Desactivar
                </Button>
              )}
            </span>}
          </>
        )}
      />

      <ConfirmDialog
        open={!!confirmDisable}
        onClose={() => setConfirmDisable(null)}
        onConfirm={() => { if (confirmDisable) return setDisabled(confirmDisable, true); }}
        title={`Desactivar a ${confirmDisable?.name ?? confirmDisable?.email ?? ""}`}
        description="No podrá iniciar sesión, sus sesiones abiertas se cerrarán en menos de un minuto y dejará de recibir chats asignados. Sus datos y su historial se conservan; puedes reactivarlo cuando quieras."
        confirmLabel="Desactivar"
        tone="danger"
        loading={!!confirmDisable && togglingId === confirmDisable.id}
      />

      <ConfirmDialog
        open={!!confirmReset2fa}
        onClose={() => setConfirmReset2fa(null)}
        onConfirm={() => { if (confirmReset2fa) return resetTwoFactor(confirmReset2fa); }}
        title={`Quitar la verificación en dos pasos de ${confirmReset2fa?.name ?? confirmReset2fa?.email ?? ""}`}
        description="Úsalo solo si perdió su teléfono y sus códigos de respaldo, y confirma su identidad por otro medio. Podrá entrar solo con su contraseña, sus sesiones abiertas se cerrarán y conviene que la vuelva a activar."
        confirmLabel="Quitar"
        tone="warning"
        loading={!!confirmReset2fa && togglingId === confirmReset2fa.id}
      />

      <TeamsSection />

      <InviteFormModal open={showInvite} onClose={() => setShowInvite(false)} onInvited={() => { void fetchInvitations(); void reloadLicenses(); }} />

      <LicenseModal
        key={licenseUser?.id ?? "none"}
        user={licenseUser}
        licenses={licenses}
        onClose={() => setLicenseUser(null)}
        onChanged={() => { void fetchUsers(); void reloadLicenses(); }}
      />

      <UserFormModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => { void fetchUsers(); void reloadLicenses(); }}
      />
    </div>
  );
}
