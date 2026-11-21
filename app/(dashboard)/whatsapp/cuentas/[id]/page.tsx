"use client";

import { useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import { Copy, Check, Trash2, RefreshCw, MessageCircle, FileText, Pencil, UserPlus, X, ArrowLeft, Plus, KeyRound } from "lucide-react";
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
import { ListErrorState } from "@/app/components/ui/list-error-state";
import { ConexionCard } from "./_conexion";
import { BienvenidaSection } from "./_bienvenida";
import { useToast } from "@/app/components/ui/toast";
import { canSendLabel, messagingLimitLabel, nameStatusLabel, qualityLabel } from "@/lib/platform/whatsapp-health-rules";
import { ChannelOwnerBadge, ChannelOwnerModal, type ChannelOwnerInfo } from "@/app/components/channel-accounts/owner-modal";
import { useRunOnChange } from "@/app/components/ui/use-run-on-change";

interface AccountDetail {
  owner?: ChannelOwnerInfo | null;
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
  autoAssignOnlineOnly: boolean;
  csatEnabled: boolean;
  welcomeMessageEnabled: boolean;
  welcomeMessageText: string | null;
  qualityRating: string | null;
  messagingTier: string | null;
  qualityUpdatedAt: string | null;
  qualityEvent: string | null;
  nameStatus: string | null;
  canSendMessage: string | null;
  healthNotices: string[] | null;
  healthCheckedAt: string | null;
  hasAppSecret: boolean;
  usesPlatformApp: boolean;
  coexistence: boolean;
  callingEnabled: boolean;
  syncStatus: string;
  syncProgress: number | null;
  syncDeadlineAt: string | null;
  syncError: string | null;
  historySkippedChats: number;
  historySkippedMessages: number;
  tokenExpiresAt: string | null;
  disconnectedReason: string | null;
  webhookUrl: string;
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
function canSendTone(value: string): "success" | "warning" | "danger" | "neutral" {
  if (value === "AVAILABLE") return "success";
  if (value === "LIMITED") return "warning";
  if (value === "BLOCKED") return "danger";
  return "neutral";
}

function qualityTone(rating: string): "success" | "warning" | "danger" | "neutral" {
  const r = rating.toUpperCase();
  if (r.includes("RED") || (r.includes("FLAG") && !r.includes("UNFLAG"))) return "danger";
  if (r.includes("YELLOW") || r.includes("DOWNGRADE")) return "warning";
  if (r.includes("GREEN") || r.includes("UNFLAG") || r.includes("UPGRADE")) return "success";
  return "neutral";
}

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

// Roadmap P3-d — reglas de enrutamiento de auto-asignación.
interface RoutingRule {
  id: string;
  order: number;
  conditionType: "TAG" | "LEAD_ORIGIN" | "SCORE_LABEL";
  conditionValue: string;
  conditionLabel: string;
  assignedTo: { id: string; name: string | null; email: string };
}
interface TagOption { id: string; name: string }
interface EligibleUser { id: string; name: string | null; email: string }

const LEAD_ORIGIN_OPTIONS = [
  { value: "ORGANIC", label: "Orgánico" },
  { value: "INSTANT_FORM", label: "Formulario de Meta Ads" },
  { value: "CTWA", label: "Click-to-WhatsApp (anuncio)" },
];
const SCORE_LABEL_OPTIONS = [
  { value: "descartado", label: "Descartado" },
  { value: "frio", label: "Frío" },
  { value: "interesado", label: "Interesado" },
  { value: "oportunidad", label: "Oportunidad" },
  { value: "prioridad_alta", label: "Prioridad alta" },
];
const CONDITION_TYPE_LABEL: Record<RoutingRule["conditionType"], string> = {
  TAG: "Etiqueta",
  LEAD_ORIGIN: "Origen del contacto",
  SCORE_LABEL: "Calificación de IA",
};

export default function CuentaDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const { success, error: toastError } = useToast();
  const id = params.id as string;

  const [account, setAccount] = useState<AccountDetail | null>(null);
  const canManage = isAdmin || (!!account && account.userId === session?.user?.id);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editingAppId, setEditingAppId] = useState(false);
  const [appIdDraft, setAppIdDraft] = useState("");
  const [savingAppId, setSavingAppId] = useState(false);
  const [editingAppSecret, setEditingAppSecret] = useState(false);
  const [appSecretDraft, setAppSecretDraft] = useState("");
  const [savingAppSecret, setSavingAppSecret] = useState(false);

  const [sharedUsers, setSharedUsers] = useState<UserOption[]>([]);
  const [allUsers, setAllUsers] = useState<UserOption[]>([]);
  const [shareUserId, setShareUserId] = useState("");
  const [sharing, setSharing] = useState(false);

  const [routingRules, setRoutingRules] = useState<RoutingRule[]>([]);
  const [routingAssignees, setRoutingAssignees] = useState<EligibleUser[]>([]);
  const [tags, setTags] = useState<TagOption[]>([]);
  const [ruleConditionType, setRuleConditionType] = useState<RoutingRule["conditionType"]>("TAG");
  const [ruleConditionValue, setRuleConditionValue] = useState("");
  const [ruleAssignedToId, setRuleAssignedToId] = useState("");
  const [addingRule, setAddingRule] = useState(false);

  const [ownerOpen, setOwnerOpen] = useState(false);
  const fetchAccount = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/whatsapp/accounts/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al cargar");
      setAccount(data);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Error al cargar cuenta");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useRunOnChange(() => fetchAccount(), [fetchAccount]);

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

  useRunOnChange(() => {
    if (!isAdmin) return;
    fetchSharing();
  }, [isAdmin, fetchSharing]);

  const fetchRoutingRules = useCallback(async () => {
    try {
      const res = await fetch(`/api/whatsapp/accounts/${id}/routing-rules`);
      const data = await res.json();
      if (Array.isArray(data.rules)) setRoutingRules(data.rules);
      if (Array.isArray(data.eligibleAssignees)) setRoutingAssignees(data.eligibleAssignees);
    } catch {
      // silencioso — igual que fetchSharing, es secundario a la info principal de la cuenta
    }
  }, [id]);

  useRunOnChange(() => {
    if (!canManage) return;
    fetchRoutingRules();
    fetch(`/api/whatsapp/tags?waAccountId=${id}`).then(r => r.json()).then(d => { if (Array.isArray(d)) setTags(d); }).catch(() => {});
  }, [canManage, fetchRoutingRules, id]);

  async function handleAddRule() {
    if (!ruleConditionValue || !ruleAssignedToId) {
      toastError("Completa la condición y el usuario destino");
      return;
    }
    setAddingRule(true);
    try {
      const res = await fetch(`/api/whatsapp/accounts/${id}/routing-rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conditionType: ruleConditionType, conditionValue: ruleConditionValue, assignedToId: ruleAssignedToId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al crear la regla");
      // No se agrega `data` directo al estado — la respuesta del POST no trae
      // conditionLabel (ese cruce con el catálogo de Tag solo lo hace el GET);
      // re-fetch asegura que la fila nueva se vea igual que las demás.
      await fetchRoutingRules();
      setRuleConditionValue("");
      setRuleAssignedToId("");
      success("Regla de enrutamiento agregada");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Error al crear la regla");
    } finally {
      setAddingRule(false);
    }
  }

  async function handleDeleteRule(ruleId: string) {
    try {
      const res = await fetch(`/api/whatsapp/accounts/${id}/routing-rules/${ruleId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setRoutingRules(prev => prev.filter(r => r.id !== ruleId));
      success("Regla eliminada");
    } catch {
      toastError("Error al eliminar la regla");
    }
  }

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

  async function handleSaveAppSecret() {
    if (!appSecretDraft.trim()) {
      toastError("El App Secret no puede quedar vacío");
      return;
    }
    setSavingAppSecret(true);
    try {
      const res = await fetch(`/api/whatsapp/accounts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appSecret: appSecretDraft.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al guardar");
      setAccount((prev) => prev && { ...prev, hasAppSecret: data.hasAppSecret });
      setEditingAppSecret(false);
      setAppSecretDraft("");
      success("App Secret actualizado");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Error al guardar el App Secret");
    } finally {
      setSavingAppSecret(false);
    }
  }

  async function handleToggleCalling(enabled: boolean) {
    if (!account) return;
    setAccount({ ...account, callingEnabled: enabled });
    try {
      const res = await fetch(`/api/whatsapp/accounts/${id}/calling`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "No se pudo cambiar las llamadas");
    } catch (err) {
      setAccount((prev) => prev && { ...prev, callingEnabled: !enabled });
      toastError(err instanceof Error ? err.message : "No se pudo cambiar las llamadas");
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

  async function handleToggleOnlineOnly(enabled: boolean) {
    if (!account) return;
    setAccount({ ...account, autoAssignOnlineOnly: enabled });
    try {
      const res = await fetch(`/api/whatsapp/accounts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoAssignOnlineOnly: enabled }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setAccount((prev) => prev && { ...prev, autoAssignOnlineOnly: !enabled });
      toastError("Error al actualizar la asignación");
    }
  }

  async function handleToggleCsat(enabled: boolean) {
    if (!account) return;
    setAccount({ ...account, csatEnabled: enabled });
    try {
      const res = await fetch(`/api/whatsapp/accounts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csatEnabled: enabled }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setAccount((prev) => prev && { ...prev, csatEnabled: !enabled });
      toastError("Error al actualizar la encuesta de satisfacción");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (loadError) {
    return <div className="space-y-4"><ListErrorState message={loadError} onRetry={fetchAccount} /><Button href="/whatsapp/cuentas" icon={ArrowLeft} variant="secondary">Volver</Button></div>;
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
      // Arriba lo que se usa a diario; antes quedaban al final de 3 pantallas
      // en el teléfono. Actualizar y Eliminar siguen abajo.
      actions={
        <>
          <Button size="sm" href={`/whatsapp/chat?accountId=${account.id}`} icon={MessageCircle}>Abrir chats</Button>
          <Button size="sm" href={`/whatsapp/plantillas?accountId=${account.id}`} variant="secondary" icon={FileText}>Plantillas</Button>
        </>
      }
    >
      {account.status === "ERROR" && account.errorMessage && (
        <Banner tone="danger" title="Error en la cuenta">
          {account.errorMessage}
        </Banner>
      )}

      {!account.hasAppSecret && (
        <Banner tone="danger" title="Esta cuenta no está recibiendo mensajes">
          Falta el App Secret. Sin él no se puede validar la firma de los webhooks de Meta y se descartan todos los
          mensajes entrantes y los estados de entrega. {canManage
            ? <>Agrégalo abajo, en &quot;App Secret&quot;.</>
            : "Pide al responsable de la cuenta que lo configure."}
        </Banner>
      )}

      <div className="space-y-6">
        <ConexionCard initial={account} />
        <section className="space-y-4">
          <SectionHeader title="Información de la cuenta" />
          <dl className="space-y-4">
            <DetailRow label="Número" value={<span className="tabular-nums">{account.phoneNumber ?? "—"}</span>} />
            <DetailRow label="Phone Number ID" value={<span className="tabular-nums">{account.phoneNumberId}</span>} />
            <DetailRow label="WABA ID" value={<span className="tabular-nums">{account.wabaId ?? "—"}</span>} />
            <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
              <dt className="shrink-0 text-sm text-muted-darker">App ID</dt>
              {editingAppId ? (
                <div className="flex flex-1 items-center justify-end gap-2">
                  <Input
                    value={appIdDraft}
                    onChange={(e) => setAppIdDraft(e.target.value)}
                    placeholder="123456789012345"
                    className="max-w-[200px] tabular-nums text-sm"
                  />
                  <Button size="sm" onClick={handleSaveAppId} disabled={savingAppId}>
                    {savingAppId ? <Spinner /> : "Guardar"}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setEditingAppId(false)}>
                    Cancelar
                  </Button>
                </div>
              ) : (
                <dd className="flex items-center gap-2 tabular-nums text-sm">
                  {account.appId ?? "—"}
                  {canManage && <Button type="button" variant="ghost" size="icon" icon={Pencil} className="-my-1.5" onClick={startEditAppId} aria-label="Editar App ID" />}
                </dd>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
              <dt className="shrink-0 text-sm text-muted-darker">App Secret</dt>
              {editingAppSecret ? (
                <div className="flex flex-1 items-center justify-end gap-2">
                  <Input
                    type="password"
                    autoComplete="off"
                    value={appSecretDraft}
                    onChange={(e) => setAppSecretDraft(e.target.value)}
                    placeholder="abc123…"
                    aria-label="Nuevo App Secret"
                    className="max-w-[200px] tabular-nums text-sm"
                  />
                  <Button size="sm" onClick={handleSaveAppSecret} disabled={savingAppSecret}>
                    {savingAppSecret ? <Spinner /> : "Guardar"}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => { setEditingAppSecret(false); setAppSecretDraft(""); }}>
                    Cancelar
                  </Button>
                </div>
              ) : (
                <dd className="flex items-center gap-2 text-sm">
                  {account.usesPlatformApp ? (
                    <Badge tone="neutral" size="sm">La gestiona Colibly</Badge>
                  ) : account.hasAppSecret ? (
                    <Badge tone="success" size="sm">Configurado</Badge>
                  ) : (
                    <Badge tone="danger" size="sm">Falta</Badge>
                  )}
                  {canManage && !account.usesPlatformApp && <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    icon={account.hasAppSecret ? Pencil : KeyRound}
                    className="-my-1.5"
                    onClick={() => setEditingAppSecret(true)}
                    aria-label={account.hasAppSecret ? "Reemplazar App Secret" : "Agregar App Secret"}
                  />}
                </dd>
              )}
            </div>
            {/* Salud según Graph (lib/whatsapp/phone-health.ts, caché de 10 min). */}
            {account.canSendMessage && (
              <div className="flex items-center justify-between border-b border-border pb-3">
                <dt className="text-sm text-muted-darker">Envío de mensajes</dt>
                <dd>
                  <Badge tone={canSendTone(account.canSendMessage)} size="sm">{canSendLabel(account.canSendMessage)}</Badge>
                </dd>
              </div>
            )}
            {(account.qualityRating || account.messagingTier) && (
              <div className="flex items-center justify-between border-b border-border pb-3">
                <dt className="text-sm text-muted-darker">Calidad del número</dt>
                <dd className="flex items-center gap-2">
                  {account.qualityRating && (
                    <Badge tone={qualityTone(account.qualityRating)} size="sm">{qualityLabel(account.qualityRating)}</Badge>
                  )}
                  {account.messagingTier && (
                    <span className="text-xs text-muted-darker">{messagingLimitLabel(account.messagingTier)}</span>
                  )}
                </dd>
              </div>
            )}
            {account.nameStatus && (
              <DetailRow label="Nombre para mostrar" value={nameStatusLabel(account.nameStatus)} />
            )}
            {account.qualityEvent && (
              <DetailRow label="Último aviso de calidad de Meta" value={account.qualityEvent} />
            )}
            {account.healthNotices && account.healthNotices.length > 0 && (
              <div className="border-b border-border pb-3">
                <dt className="mb-1 text-sm text-muted-darker">Avisos de Meta</dt>
                <dd>
                  <ul className="space-y-1 text-sm text-foreground">
                    {account.healthNotices.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
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
                      day: "numeric", month: "short", year: "numeric",
                      hour: "numeric", minute: "2-digit",
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
              {account.webhookUrl}
            </code>
            <Button
              variant="secondary"
              size="sm"
              icon={copied ? Check : Copy}
              onClick={() => handleCopy(account.webhookUrl)}
            >
              {copied ? "Copiado" : "Copiar"}
            </Button>
          </div>
        </section>

        {canManage && <section className="space-y-4">
          <SectionHeader title="Llamadas de WhatsApp" />
          {account.coexistence ? (
            <p className="text-sm text-muted-darker">
              Este número sigue en la app de WhatsApp. Las llamadas se contestan en el celular, no en Colibly.
            </p>
          ) : (
            <div className="flex items-center justify-between gap-3 py-1">
              <div>
                <p className="text-sm font-medium text-foreground">Recibir y hacer llamadas en la bandeja</p>
                <p className="text-xs text-muted-darker">
                  Muestra el botón de llamada en el chat del cliente. En la app de Meta, el webhook tiene que incluir el campo calls. Quien llama tiene que autorizar antes de que podamos devolverle la llamada. Meta cobra las llamadas que hacemos nosotros. Al contestar o al marcar, WhatsApp avisa que la llamada se graba y se transcribe; el audio y el texto quedan en el chat.
                </p>
              </div>
              <Switch checked={account.callingEnabled} onCheckedChange={handleToggleCalling} label="Llamadas de WhatsApp" />
            </div>
          )}
        </section>}

        {canManage && <section className="space-y-4">
          <SectionHeader title="Asignación de chats" />
          <div className="flex items-center justify-between py-1">
            <div>
              <p className="text-sm font-medium text-foreground">Auto-asignación de chats nuevos</p>
              <p className="text-xs text-muted-darker">
                Reparte automáticamente los chats sin asignar entre los agentes con acceso a esta cuenta, según su carga actual.
              </p>
            </div>
            <Switch checked={account.autoAssignEnabled} onCheckedChange={handleToggleAutoAssign} label="Auto-asignación de chats nuevos" />
          </div>

          {account.autoAssignEnabled && (
            <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
              <div>
                <p className="text-sm font-medium text-foreground">Solo asignar a ejecutivos en línea</p>
                <p className="text-xs text-muted-darker">
                  Salta a quien está ocupado, desconectado o lleva más de 5 minutos sin la app abierta. Si nadie está en línea, el
                  chat queda sin asignar.
                </p>
              </div>
              <Switch checked={account.autoAssignOnlineOnly} onCheckedChange={handleToggleOnlineOnly} label="Solo asignar a ejecutivos en línea" />
            </div>
          )}

          {account.autoAssignEnabled && (
            <div className="space-y-3 border-t border-border pt-4">
              <div>
                <p className="text-sm font-medium text-foreground">Reglas de enrutamiento</p>
                <p className="text-xs text-muted-darker">
                  Antes de repartir por carga, se revisan estas reglas en orden — la primera que aplique manda el chat directo a ese agente (si aún tiene cupo).
                </p>
              </div>

              {routingRules.length > 0 && (
                <ol className="space-y-1.5">
                  {routingRules.map((r, i) => (
                    <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-light px-3 py-2 text-sm">
                      <span>
                        <span className="text-muted-darker">{i + 1}.</span>{" "}
                        Si <strong>{CONDITION_TYPE_LABEL[r.conditionType]}</strong> = &quot;{r.conditionLabel}&quot; → {r.assignedTo.name ?? r.assignedTo.email}
                      </span>
                      <Button type="button" variant="ghost" size="icon" icon={X} className="-my-1.5 hover:text-danger" onClick={() => handleDeleteRule(r.id)} aria-label="Eliminar regla" />
                    </li>
                  ))}
                </ol>
              )}

              <div className="flex flex-wrap items-end gap-2">
                <Select
                  aria-label="Tipo de condición de enrutamiento"
                  value={ruleConditionType}
                  onChange={(e) => { setRuleConditionType(e.target.value as RoutingRule["conditionType"]); setRuleConditionValue(""); }}
                  className="w-40"
                >
                  <option value="TAG">Etiqueta</option>
                  <option value="LEAD_ORIGIN">Origen del contacto</option>
                  <option value="SCORE_LABEL">Calificación de IA</option>
                </Select>

                <Select aria-label="Valor de la condición de enrutamiento" value={ruleConditionValue} onChange={(e) => setRuleConditionValue(e.target.value)} className="flex-1 min-w-[140px]">
                  <option value="">Seleccionar valor</option>
                  {ruleConditionType === "TAG" && tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  {ruleConditionType === "LEAD_ORIGIN" && LEAD_ORIGIN_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  {ruleConditionType === "SCORE_LABEL" && SCORE_LABEL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>

                <span className="text-xs text-muted-darker">→</span>

                <Select aria-label="Agente destinatario de la regla" value={ruleAssignedToId} onChange={(e) => setRuleAssignedToId(e.target.value)} className="flex-1 min-w-[160px]">
                  <option value="">Asignar a…</option>
                  {routingAssignees.map(u => <option key={u.id} value={u.id}>{u.name ?? u.email}</option>)}
                </Select>

                <Button size="sm" icon={addingRule ? undefined : Plus} onClick={handleAddRule} disabled={addingRule}>
                  {addingRule ? <Spinner /> : "Agregar"}
                </Button>
              </div>
            </div>
          )}
        </section>}

        {canManage && (
          <section className="space-y-4">
            <SectionHeader title="Satisfacción del cliente" />
            <div className="flex items-center justify-between py-1">
              <div>
                <p className="text-sm font-medium text-foreground">Encuesta al resolver</p>
                <p className="text-xs text-muted-darker">
                  Envía un enlace de 1 a 5 estrellas cuando se resuelve un chat. Solo sale si la ventana de 24 h de WhatsApp sigue abierta; una encuesta por chat.
                </p>
              </div>
              <Switch checked={account.csatEnabled} onCheckedChange={handleToggleCsat} label="Encuesta CSAT al resolver" />
            </div>
          </section>
        )}

        {canManage && account.phoneNumberId && (
          <BienvenidaSection accountId={account.id} enabled={account.welcomeMessageEnabled} text={account.welcomeMessageText} />
        )}

        {isAdmin && (
          <section className="space-y-4">
            <SectionHeader title="Titular y licencia" />
            <p className="text-sm text-muted">
              El número funciona con la licencia de su dueño: bots, difusiones, automatizaciones y llamadas dependen de ese plan. Cada licencia incluye un número de WhatsApp.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <ChannelOwnerBadge owner={account.owner} />
              <Button size="sm" variant="secondary" onClick={() => setOwnerOpen(true)}>
                Cambiar titular
              </Button>
            </div>
            <ChannelOwnerModal open={ownerOpen} onClose={() => setOwnerOpen(false)} kind="whatsapp" account={account} onChanged={fetchAccount} />
          </section>
        )}

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
                    <Button variant="ghost" size="icon" icon={X} onClick={() => handleUnshare(u.id)} aria-label={`Quitar acceso a ${u.name ?? u.email}`} />
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-darker">Todavía no compartes esta cuenta con nadie.</p>
            )}

            <div className="flex items-center gap-2">
              <Select aria-label="Usuario con quien compartir la cuenta" value={shareUserId} onChange={(e) => setShareUserId(e.target.value)} className="flex-1">
                <option value="">Seleccionar usuario…</option>
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
          <Button variant="secondary" icon={RefreshCw} onClick={fetchAccount}>
            Actualizar
          </Button>
          {canManage && <Button
            variant="danger"
            icon={Trash2}
            onClick={() => setDeleteOpen(true)}
          >
            Eliminar
          </Button>}
        </div>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Eliminar cuenta"
        description={`¿Estás seguro de eliminar "${account.name}"? Esta acción eliminará permanentemente todos los chats y mensajes asociados. No se puede deshacer.`}
        confirmLabel={deleting ? "Eliminando…" : "Eliminar"}
        tone="danger"
        onConfirm={handleDelete}
      />
    </DetailPage>
  );
}
