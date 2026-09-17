"use client";

import { useState, useEffect, useCallback } from "react";
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
  hasAppSecret: boolean;
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
  LEAD_ORIGIN: "Origen del lead",
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
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, no depende de rol (a diferencia de compartir)
    fetchRoutingRules();
    fetch(`/api/whatsapp/tags?waAccountId=${id}`).then(r => r.json()).then(d => { if (Array.isArray(d)) setTags(d); }).catch(() => {});
  }, [fetchRoutingRules, id]);

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

      {!account.hasAppSecret && (
        <Banner tone="danger" title="Esta cuenta no está recibiendo mensajes">
          Falta el App Secret. Sin él no se puede validar la firma de los webhooks de Meta y se descartan todos los
          mensajes entrantes y los estados de entrega. Agrégalo abajo, en &quot;App Secret&quot;.
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
            <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
              <dt className="shrink-0 text-sm text-muted-darker">App Secret</dt>
              {editingAppSecret ? (
                <div className="flex flex-1 items-center justify-end gap-2">
                  <Input
                    type="password"
                    autoComplete="off"
                    value={appSecretDraft}
                    onChange={(e) => setAppSecretDraft(e.target.value)}
                    placeholder="abc123..."
                    aria-label="Nuevo App Secret"
                    className="max-w-[200px] font-mono text-sm"
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
                  {account.hasAppSecret ? (
                    <Badge tone="success" size="sm">Configurado</Badge>
                  ) : (
                    <Badge tone="danger" size="sm">Falta</Badge>
                  )}
                  <button
                    onClick={() => setEditingAppSecret(true)}
                    className="text-muted-darker transition-colors hover:text-foreground"
                    aria-label={account.hasAppSecret ? "Reemplazar App Secret" : "Agregar App Secret"}
                  >
                    {account.hasAppSecret ? <Pencil size={13} /> : <KeyRound size={13} />}
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
                      <button
                        onClick={() => handleDeleteRule(r.id)}
                        className="text-muted-darker transition-colors hover:text-danger"
                        aria-label="Eliminar regla"
                      >
                        <X size={14} />
                      </button>
                    </li>
                  ))}
                </ol>
              )}

              <div className="flex flex-wrap items-end gap-2">
                <Select
                  value={ruleConditionType}
                  onChange={(e) => { setRuleConditionType(e.target.value as RoutingRule["conditionType"]); setRuleConditionValue(""); }}
                  className="w-40"
                >
                  <option value="TAG">Etiqueta</option>
                  <option value="LEAD_ORIGIN">Origen del lead</option>
                  <option value="SCORE_LABEL">Calificación de IA</option>
                </Select>

                <Select value={ruleConditionValue} onChange={(e) => setRuleConditionValue(e.target.value)} className="flex-1 min-w-[140px]">
                  <option value="">Seleccionar valor</option>
                  {ruleConditionType === "TAG" && tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  {ruleConditionType === "LEAD_ORIGIN" && LEAD_ORIGIN_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  {ruleConditionType === "SCORE_LABEL" && SCORE_LABEL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>

                <span className="text-xs text-muted-darker">→</span>

                <Select value={ruleAssignedToId} onChange={(e) => setRuleAssignedToId(e.target.value)} className="flex-1 min-w-[160px]">
                  <option value="">Asignar a...</option>
                  {routingAssignees.map(u => <option key={u.id} value={u.id}>{u.name ?? u.email}</option>)}
                </Select>

                <Button size="sm" icon={addingRule ? undefined : Plus} onClick={handleAddRule} disabled={addingRule}>
                  {addingRule ? <Spinner /> : "Agregar"}
                </Button>
              </div>
            </div>
          )}
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
