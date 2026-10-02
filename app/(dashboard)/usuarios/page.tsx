"use client";

import { useState, useEffect, useCallback } from "react";
import { Mail, RotateCw, Shield, ShieldOff, UserPlus, Users, UserX, UserCheck, X } from "lucide-react";
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

interface UserData {
  id: string;
  name: string | null;
  email: string;
  role: string;
  disabledAt: string | null;
  createdAt: string;
  waAccounts: Array<{ id: string; name: string }>;
  isOwner: boolean;
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  createdAt: string;
  expiresAt: string;
  invitedBy: { name: string | null; email: string } | null;
}

const ROLE_LABEL: Record<string, string> = { admin: "Admin", user: "Usuario", ejecutivo: "Ejecutivo" };

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
        body: JSON.stringify({ email: inv.email, role: inv.role }),
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
      const labels: Record<string, string> = { admin: "Admin", user: "Usuario", ejecutivo: "Ejecutivo" };
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
    const labels: Record<string, string> = { user: "Ejecutivo", ejecutivo: "Admin", admin: "Usuario" };
    return labels[role] ?? "Usuario";
  }

  function nextRoleIcon(role: string) {
    return role === "admin" ? ShieldOff : Shield;
  }

  return (
    <div className="space-y-6">
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

      {invitationLoadError && <Banner tone="danger">{invitationLoadError} <button type="button" onClick={fetchInvitations} className="underline">Reintentar</button></Banner>}

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
                  leading={<EntityAvatar id={inv.email} name={inv.email} size="sm" />}
                  title={<span className="font-mono">{inv.email}</span>}
                  badges={<Badge tone="neutral" size="sm">{ROLE_LABEL[inv.role] ?? inv.role}</Badge>}
                  subtitle={`Vence el ${new Date(inv.expiresAt).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}${inv.invitedBy ? ` · la envió ${inv.invitedBy.name ?? inv.invitedBy.email}` : ""}`}
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
              leading={<EntityAvatar id={u.id} name={u.name ?? u.email} size="sm" />}
              title={u.name ?? "—"}
              badges={
                <>
                  <Badge tone={u.role === "admin" ? "warning" : u.role === "ejecutivo" ? "info" : "neutral"} size="sm">
                    {u.role === "admin" ? "Admin" : u.role === "ejecutivo" ? "Ejecutivo" : "Usuario"}
                  </Badge>
                  {u.isOwner && <Badge tone="accent" size="sm">Dueña</Badge>}
                  {u.disabledAt && <Badge tone="danger" size="sm">Desactivado</Badge>}
                </>
              }
              subtitle={
                <>
                  <span className="font-mono">{u.email}</span> · {u.waAccounts.length} cuenta(s)
                </>
              }
              meta={
                <span className="font-mono">
                  {new Date(u.createdAt).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}
                </span>
              }
            />
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

      <InviteFormModal open={showInvite} onClose={() => setShowInvite(false)} onInvited={fetchInvitations} />

      <UserFormModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={fetchUsers}
      />
    </div>
  );
}
