"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import { Copy, Check, Trash2, RefreshCw, MessageCircle, FileText, Pencil, UserPlus, X, ArrowLeft } from "lucide-react";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Select } from "@/app/components/ui/select";
import { Spinner } from "@/app/components/ui/spinner";
import { ConfirmDialog } from "@/app/components/ui/confirm-dialog";
import { Banner } from "@/app/components/ui/banner";
import { Switch } from "@/app/components/ui/switch";
import { SectionHeader } from "@/app/components/ui/section-header";
import { DetailPage, DetailRow } from "@/app/components/ui/detail-page";
import { useToast } from "@/app/components/ui/toast";

interface AccountDetail {
  id: string;
  userId: string;
  name: string;
  phoneNumber: string | null;
  phoneNumberId: string;
  wabaId: string | null;
  appId: string | null;
  status: string;
  errorMessage: string | null;
  lastActivity: string | null;
  autoAssignEnabled: boolean;
  qualityRating: string | null;
  messagingTier: string | null;
  qualityUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { chats: number; templates: number };
}

const STATUS_BADGE: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  CONNECTED:    { label: "Conectado",   tone: "success" },
  PENDING:      { label: "Pendiente",    tone: "warning" },
  ERROR:        { label: "Error",        tone: "danger" },
  DISCONNECTED: { label: "Desconectado", tone: "neutral" },
};

// Tono por valor crudo de Meta — cubre tanto ratings tipo "GREEN"/"YELLOW"/"RED"
// como nombres de evento tipo "FLAGGED"/"UNFLAGGED", según lo que reporte el
// webhook phone_number_quality_update.
function qualityTone(rating: string): "success" | "warning" | "danger" | "neutral" {
  const r = rating.toUpperCase();
  if (r.includes("RED") || (r.includes("FLAG") && !r.includes("UNFLAG"))) return "danger";
  if (r.includes("YELLOW") || r.includes("DOWNGRADE")) return "warning";
  if (r.includes("GREEN") || r.includes("UNFLAG") || r.includes("UPGRADE")) return "success";
  return "neutral";
}

const WEBHOOK_PATH = "/api/whatsapp/webhook";

interface UserOption {
  id: string;
  name: string | null;
  email: string;
  role: string;
}

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  user: "Usuario",
  ejecutivo: "Ejecutivo",
};

export default function CuentaDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const { success, error: toastError } = useToast();
  const id = params.id as string;

  const [account, setAccount] = useState<AccountDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editingAppId, setEditingAppId] = useState(false);
  const [appIdDraft, setAppIdDraft] = useState("");
  const [savingAppId, setSavingAppId] = useState(false);

  const [sharedUsers, setSharedUsers] = useState<UserOption[]>([]);
  const [allUsers, setAllUsers] = useState<UserOption[]>([]);
  const [shareUserId, setShareUserId] = useState("");
  const [sharing, setSharing] = useState(false);

  const fetchAccount = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/whatsapp/accounts/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al cargar");
      setAccount(data);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Error al cargar cuenta");
    } finally {
      setLoading(false);
    }
  }, [id, toastError]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    fetchAccount();
  }, [fetchAccount]);

  const fetchSharing = useCallback(async () => {
    try {
      const [sharedRes, usersRes] = await Promise.all([
        fetch(`/api/whatsapp/accounts/${id}/share`),
        fetch(`/api/usuarios`),
      ]);
      const sharedData = await sharedRes.json();
      const usersData = await usersRes.json();
      if (Array.isArray(sharedData)) setSharedUsers(sharedData);
      if (Array.isArray(usersData)) setAllUsers(usersData);
    } catch {
      // silencioso — la sección de compartir es secundaria a la info principal de la cuenta
    }
  }, [id]);

  useEffect(() => {
    if (!isAdmin) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, gated by role
    fetchSharing();
  }, [isAdmin, fetchSharing]);

  async function handleShare() {
    if (!shareUserId) return;
    setSharing(true);
    try {
      const res = await fetch(`/api/whatsapp/accounts/${id}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: shareUserId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al compartir");
      setShareUserId("");
      await fetchSharing();
      success("Cuenta compartida");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Error al compartir la cuenta");
    } finally {
      setSharing(false);
    }
  }

  async function handleUnshare(userId: string) {
    try {
      const res = await fetch(`/api/whatsapp/accounts/${id}/share?userId=${userId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setSharedUsers((prev) => prev.filter((u) => u.id !== userId));
      success("Acceso removido");
    } catch {
      toastError("Error al quitar el acceso");
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/whatsapp/accounts/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Error al eliminar");
      success("Cuenta eliminada");
      router.push("/whatsapp/cuentas");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Error al eliminar");
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  }

  function getWebhookUrl() {
    return typeof window !== "undefined"
      ? `${window.location.origin}${WEBHOOK_PATH}`
      : WEBHOOK_PATH;
  }

  async function handleCopy(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function startEditAppId() {
    setAppIdDraft(account?.appId ?? "");
    setEditingAppId(true);
  }

  async function handleSaveAppId() {
    if (appIdDraft.trim() && !/^\d+$/.test(appIdDraft.trim())) {
      toastError("El App ID debe ser un ID numérico");
      return;
    }
    setSavingAppId(true);
    try {
      const res = await fetch(`/api/whatsapp/accounts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId: appIdDraft.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al guardar");
      setAccount((prev) => prev && { ...prev, appId: data.appId });
      setEditingAppId(false);
      success("App ID actualizado");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Error al guardar el App ID");
    } finally {
      setSavingAppId(false);
    }
  }

  async function handleToggleAutoAssign(enabled: boolean) {
    if (!account) return;
    setAccount({ ...account, autoAssignEnabled: enabled });
    try {
      const res = await fetch(`/api/whatsapp/accounts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoAssignEnabled: enabled }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setAccount((prev) => prev && { ...prev, autoAssignEnabled: !enabled });
      toastError("Error al actualizar auto-asignación");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (!account) {
    return (
      <div className="space-y-4">
        <Banner tone="danger" title="Cuenta no encontrada">
          La cuenta solicitada no existe o no tienes acceso.
        </Banner>
        <Button href="/whatsapp/cuentas" icon={ArrowLeft} variant="secondary">Volver</Button>
      </div>
    );
  }

  const badge = STATUS_BADGE[account.status] ?? { label: account.status, tone: "neutral" as const };

  return (
    <DetailPage
      backHref="/whatsapp/cuentas"
      backLabel="Volver a cuentas"
      title={account.name}
      badge={<Badge tone={badge.tone}>{badge.label}</Badge>}
    >
      {account.status === "ERROR" && account.errorMessage && (
        <Banner tone="danger" title="Error en la cuenta">
          {account.errorMessage}
        </Banner>
      )}

      <div className="space-y-8">
        <section className="space-y-4">
          <SectionHeader title="Información de la cuenta" />
          <dl className="space-y-4">
            <DetailRow label="Número" value={<span className="font-mono">{account.phoneNumber ?? "—"}</span>} />
            <DetailRow label="Phone Number ID" value={<span className="font-mono">{account.phoneNumberId}</span>} />
            <DetailRow label="WABA ID" value={<span className="font-mono">{account.wabaId ?? "—"}</span>} />
            <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
              <dt className="shrink-0 text-sm text-muted-darker">App ID</dt>
              {editingAppId ? (
                <div className="flex flex-1 items-center justify-end gap-2">
                  <Input
                    value={appIdDraft}
                    onChange={(e) => setAppIdDraft(e.target.value)}
                    placeholder="123456789012345"
                    className="max-w-[200px] font-mono text-sm"
                  />
                  <Button size="sm" onClick={handleSaveAppId} disabled={savingAppId}>
                    {savingAppId ? <Spinner /> : "Guardar"}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setEditingAppId(false)}>
                    Cancelar
                  </Button>
                </div>
              ) : (
                <dd className="flex items-center gap-2 font-mono text-sm">
                  {account.appId ?? "—"}
                  <button onClick={startEditAppId} className="text-muted-darker transition-colors hover:text-foreground" aria-label="Editar App ID">
                    <Pencil size={13} />
                  </button>
                </dd>
              )}
            </div>
            {account.qualityRating && (
              <div className="flex items-center justify-between border-b border-border pb-3">
                <dt className="text-sm text-muted-darker">Calidad del número</dt>
                <dd className="flex items-center gap-2">
                  <Badge tone={qualityTone(account.qualityRating)} size="sm">{account.qualityRating}</Badge>
                  {account.messagingTier && (
                    <span className="text-xs text-muted-darker">{account.messagingTier}</span>
                  )}
                </dd>
              </div>
            )}
            <DetailRow label="Chats activos" value={account._count.chats} />
            <DetailRow label="Plantillas" value={account._count.templates} />
            <DetailRow
              label="Última actividad"
              value={
                account.lastActivity
                  ? new Date(account.lastActivity).toLocaleDateString("es-MX", {
                      day: "2-digit", month: "long", year: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    })
                  : "—"
              }
            />
            <div className="flex justify-between">
              <dt className="text-sm text-muted-darker">Creada</dt>
              <dd className="text-sm">
                {new Date(account.createdAt).toLocaleDateString("es-MX", {
                  day: "2-digit", month: "long", year: "numeric",
                })}
              </dd>
            </div>
          </dl>
        </section>

        <section className="space-y-4">
          <SectionHeader title="Configuración del webhook" />
          <p className="text-sm text-muted">
            Configura esta URL en tu App de Meta para recibir mensajes entrantes.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded-lg bg-surface px-3 py-2 font-mono text-xs">
              {getWebhookUrl()}
            </code>
            <Button
              variant="secondary"
              size="sm"
              icon={copied ? Check : Copy}
              onClick={() => handleCopy(getWebhookUrl())}
            >
              {copied ? "Copiado" : "Copiar"}
            </Button>
          </div>
        </section>

        <section className="space-y-4">
          <SectionHeader title="Asignación de chats" />
          <div className="flex items-center justify-between py-1">
            <div>
              <p className="text-sm font-medium text-foreground">Auto-asignación de chats nuevos</p>
              <p className="text-xs text-muted-darker">
                Reparte automáticamente los chats sin asignar entre los agentes con acceso a esta cuenta, según su carga actual.
              </p>
            </div>
            <Switch checked={account.autoAssignEnabled} onCheckedChange={handleToggleAutoAssign} />
          </div>
        </section>

        {isAdmin && (
          <section className="space-y-4">
            <SectionHeader title="Compartir cuenta" />
            <p className="text-sm text-muted">
              Los usuarios con acceso pueden ver los chats, contactos y campañas de esta cuenta — dentro de lo que su propio rol ya permite ver. Compartir no cambia sus permisos de menú.
            </p>

            {sharedUsers.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {sharedUsers.map((u) => (
                  <Badge key={u.id} tone="neutral" size="sm" className="gap-1.5">
                    {u.name ?? u.email} · {ROLE_LABEL[u.role] ?? u.role}
                    <button
                      onClick={() => handleUnshare(u.id)}
                      className="hover:text-danger transition-colors"
                      aria-label={`Quitar acceso a ${u.name ?? u.email}`}
                    >
                      <X size={12} />
                    </button>
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-darker">Todavía no compartes esta cuenta con nadie.</p>
            )}

            <div className="flex items-center gap-2">
              <Select value={shareUserId} onChange={(e) => setShareUserId(e.target.value)} className="flex-1">
                <option value="">Seleccionar usuario...</option>
                {allUsers
                  .filter((u) => u.id !== account.userId && !sharedUsers.some((s) => s.id === u.id))
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name ?? u.email} ({ROLE_LABEL[u.role] ?? u.role})
                    </option>
                  ))}
              </Select>
              <Button size="sm" icon={sharing ? undefined : UserPlus} onClick={handleShare} disabled={sharing || !shareUserId}>
                {sharing ? <Spinner /> : "Compartir"}
              </Button>
            </div>
          </section>
        )}

        <div className="flex flex-wrap gap-3">
          <Button href={`/whatsapp/chat?accountId=${account.id}`} icon={MessageCircle}>Abrir chats</Button>
          <Button href={`/whatsapp/plantillas?accountId=${account.id}`} variant="secondary" icon={FileText}>Gestionar plantillas</Button>
          <Button variant="secondary" icon={RefreshCw} onClick={fetchAccount}>
            Actualizar
          </Button>
          <Button
            variant="danger"
            icon={Trash2}
            onClick={() => setDeleteOpen(true)}
          >
            Eliminar
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Eliminar cuenta"
        description={`¿Estás seguro de eliminar "${account.name}"? Esta acción eliminará permanentemente todos los chats y mensajes asociados. No se puede deshacer.`}
        confirmLabel={deleting ? "Eliminando..." : "Eliminar"}
        tone="danger"
        onConfirm={handleDelete}
      />
    </DetailPage>
  );
}
