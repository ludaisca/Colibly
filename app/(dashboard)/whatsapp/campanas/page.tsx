"use client";

import { useState, useCallback, Suspense } from "react";
import Link from "next/link";
import { Plus, Megaphone, Trash2, Send, Workflow, ExternalLink } from "lucide-react";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Switch } from "@/app/components/ui/switch";
import { EntityList, EntityRow } from "@/app/components/ui/entity-list";
import { EntityAvatar } from "@/app/components/ui/avatar";
import { ConfirmDialog } from "@/app/components/ui/confirm-dialog";
import { PageHeader } from "@/app/components/ui/page-header";
import { useToast } from "@/app/components/ui/toast";
import { Tabs, useUrlTab } from "@/app/components/ui/tabs";
import { plural } from "@/lib/format/plural";
import { Tooltip } from "@/app/components/ui/tooltip";
import { useRunOnChange } from "@/app/components/ui/use-run-on-change";

interface Campaign {
  id: string;
  name: string;
  status: string;
  scheduledAt: string | null;
  sentAt: string | null;
  completedAt: string | null;
  recipientCount: number;
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  failedCount: number;
  createdAt: string;
  waAccount: { id: string; name: string; phoneNumber: string | null };
  waTemplate: { id: string; name: string };
}

interface LeadSheetSource {
  id: string;
  name: string;
  spreadsheetId: string;
  sheetName: string;
  enabled: boolean;
  lastRunAt: string | null;
  lastImportedCount: number;
  lastError: string | null;
  waAccount: { id: string; name: string };
  waTemplate: { id: string; name: string; language: string };
}

const STATUS_BADGE: Record<string, { label: string; tone: "success" | "warning" | "info" | "danger" | "neutral" }> = {
  DRAFT:     { label: "Borrador",   tone: "neutral" },
  SCHEDULED: { label: "Programada", tone: "info" },
  SENDING:   { label: "Enviando",   tone: "warning" },
  COMPLETED: { label: "Completada", tone: "success" },
  FAILED:    { label: "Fallida",    tone: "danger" },
};

type Tab = "campanas" | "automatizacion";

function CampaignsPageContent() {
  const [tab, setTab] = useUrlTab<Tab>(["campanas", "automatizacion"], "campanas");

  return (
    <div className="space-y-5">
      <PageHeader
        title="Campañas"
      />

      <Tabs items={[{ id: "campanas", label: "Campañas" }, { id: "automatizacion", label: "Desde Google Sheets" }]} value={tab} onChange={setTab} label="Secciones de campañas">
        {tab === "campanas" ? <CampaignsTab /> : <AutomationTab />}
      </Tabs>
    </div>
  );
}

function CampaignsTab() {
  const { success, error: toastError } = useToast();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [sendTarget, setSendTarget] = useState<{ id: string; name: string; recipientCount: number } | null>(null);

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/whatsapp/campaigns");
      const data = await res.json();
      if (!res.ok || !Array.isArray(data)) throw new Error(data?.error ?? "Error al cargar campañas");
      setCampaigns(data);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Error al cargar campañas");
    } finally {
      setLoading(false);
    }
  }, []);

  useRunOnChange(() => fetchCampaigns(), [fetchCampaigns]);

  // Un borrador se envía solo con confirmación y el número real de destinatarios.
  async function handleSend() {
    if (!sendTarget) return;
    const res = await fetch(`/api/whatsapp/campaigns/${sendTarget.id}/send`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "No se pudo enviar la campaña");
    success("Campaña encolada para envío");
    setSendTarget(null);
    fetchCampaigns();
  }

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/whatsapp/campaigns/${deleteId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Error al eliminar");
      }
      success("Campaña eliminada");
      setCampaigns((prev) => prev.filter((c) => c.id !== deleteId));
      setDeleteId(null);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Error");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button href="/whatsapp/campanas/nueva" icon={Plus} size="sm">Nueva campaña</Button>
      </div>

      <EntityList
        rows={campaigns}
        rowKey={(c) => c.id}
        loading={loading}
        error={loadError}
        onRetry={fetchCampaigns}
        emptyIcon={Megaphone}
        emptyTitle="Sin campañas"
        emptyDescription="Crea tu primera campaña de WhatsApp para enviar mensajes a múltiples destinatarios."
        rowHref={(c) => `/whatsapp/campanas/${c.id}`}
        renderRow={(c) => {
          const badge = STATUS_BADGE[c.status] ?? { label: c.status, tone: "neutral" as const };
          const progress = c.recipientCount > 0
            ? Math.round((c.sentCount / c.recipientCount) * 100)
            : 0;
          return (
            <>
              <EntityRow
                leading={<EntityAvatar id={c.waAccount.id} name={c.name} size="sm" />}
                title={
                  <Link
                    href={`/whatsapp/campanas/${c.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="hover:text-accent-ink transition-colors"
                  >
                    {c.name}
                  </Link>
                }
                badges={<Badge tone={badge.tone} size="sm">{badge.label}</Badge>}
                subtitle={
                  <>
                    {c.waAccount.name} · Plantilla: {c.waTemplate.name}
                    {c.status !== "DRAFT" && (
                      <>
                        {" "}· Env: {c.sentCount} · Entr: {c.deliveredCount} · Leídos: {c.readCount}
                        {c.failedCount > 0 && <span className="text-danger"> · Fallos: {c.failedCount}</span>}
                      </>
                    )}
                  </>
                }
                meta={
                  c.status !== "DRAFT" ? (
                    <span className="flex items-center gap-2">
                      <span className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-light">
                        <span
                          className="block h-full rounded-full bg-accent transition-[width]"
                          style={{ width: `${progress}%` }}
                        />
                      </span>
                      <span className="tabular-nums">{progress}%</span>
                    </span>
                  ) : undefined
                }
              />
              {c.status === "DRAFT" && (
                <span className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <Button variant="secondary" size="sm" icon={Send} onClick={() => setSendTarget({ id: c.id, name: c.name, recipientCount: c.recipientCount })}>Enviar</Button>
                  <Tooltip label="Eliminar borrador"><Button
                    variant="ghost"
                    size="sm"
                    icon={Trash2}
                    onClick={() => setDeleteId(c.id)}
                    className="text-muted-darker hover:text-danger"
                    aria-label="Eliminar borrador"
                  /></Tooltip>
                </span>
              )}
            </>
          );
        }}
      />

      <ConfirmDialog
        open={!!sendTarget}
        onClose={() => setSendTarget(null)}
        tone="warning"
        title="¿Enviar la campaña?"
        description={sendTarget ? `¿Enviar «${sendTarget.name}» a ${sendTarget.recipientCount} ${sendTarget.recipientCount === 1 ? "contacto" : "contactos"} ahora? Meta cobra cada mensaje de plantilla de marketing o utilidad.` : undefined}
        confirmLabel="Sí, enviar"
        onConfirm={handleSend}
      />

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        loading={deleting}
        title="Eliminar campaña"
        description="Solo se pueden eliminar campañas en borrador."
        confirmLabel="Eliminar"
        tone="danger"
        onConfirm={handleDelete}
      />
    </div>
  );
}

function AutomationTab() {
  const { success, error: toastError } = useToast();
  const [sources, setSources] = useState<LeadSheetSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchSources = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/whatsapp/lead-sheet-sources");
      const data = await res.json();
      if (!res.ok || !Array.isArray(data)) throw new Error(data?.error ?? "Error al cargar las fuentes de contactos");
      setSources(data);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Error al cargar las fuentes de contactos");
    } finally {
      setLoading(false);
    }
  }, []);

  useRunOnChange(() => fetchSources(), [fetchSources]);

  async function handleToggle(source: LeadSheetSource) {
    setTogglingId(source.id);
    try {
      const res = await fetch(`/api/whatsapp/lead-sheet-sources/${source.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !source.enabled }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Error al actualizar");
      }
      setSources((prev) => prev.map((s) => (s.id === source.id ? { ...s, enabled: !s.enabled } : s)));
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Error");
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/whatsapp/lead-sheet-sources/${deleteId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Error al eliminar");
      }
      success("Fuente eliminada");
      setSources((prev) => prev.filter((s) => s.id !== deleteId));
      setDeleteId(null);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Error");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-darker max-w-xl">
          Conecta una hoja de Google Sheets (por ejemplo, la que Facebook Lead Ads sincroniza por ti) y dispara
          automáticamente una plantilla apenas aparezca un contacto nuevo. Se revisa cada 5 minutos, dentro del horario
          laboral configurado en Configuración.
        </p>
        <Button href="/whatsapp/campanas/automatizacion/nueva" icon={Plus} size="sm" className="shrink-0">
          Nueva fuente
        </Button>
      </div>

      <EntityList
        rows={sources}
        rowKey={(s) => s.id}
        loading={loading}
        error={loadError}
        onRetry={fetchSources}
        emptyIcon={Workflow}
        emptyTitle="Sin fuentes de contactos"
        emptyDescription="Conecta una hoja de Google Sheets para disparar plantillas automáticamente a contactos nuevos."
        rowHref={(s) => `/whatsapp/campanas/automatizacion/${s.id}`}
        renderRow={(s) => (
          <>
            <EntityRow
              leading={<EntityAvatar id={s.waAccount.id} name={s.name} size="sm" />}
              title={
                <Link
                  href={`/whatsapp/campanas/automatizacion/${s.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="hover:text-accent-ink transition-colors"
                >
                  {s.name}
                </Link>
              }
              badges={
                <span className="flex shrink-0 items-center gap-1">
                  <Badge tone={s.enabled ? "success" : "neutral"} size="sm">{s.enabled ? "Activa" : "Pausada"}</Badge>
                  {s.lastError && <Badge tone="danger" size="sm" className="hidden md:inline-flex">Error</Badge>}
                </span>
              }
              subtitle={
                <>
                  {s.waAccount.name} · Plantilla: {s.waTemplate.name} ·{" "}
                  <a
                    href={`https://docs.google.com/spreadsheets/d/${s.spreadsheetId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 hover:text-accent-ink"
                  >
                    {s.sheetName} <ExternalLink size={11} />
                  </a>
                  {s.lastError && <span className="text-danger"> · {s.lastError}</span>}
                </>
              }
              meta={
                <span className="tabular-nums">
                  {s.lastRunAt
                    ? `${new Date(s.lastRunAt).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} · ${plural(s.lastImportedCount, "enviado")}`
                    : "Aún no ha corrido"}
                </span>
              }
            />
            <span className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <Switch
                label={`Fuente ${s.name} activa`}
                checked={s.enabled}
                onCheckedChange={() => handleToggle(s)}
                disabled={togglingId === s.id}
              />
              <Tooltip label="Eliminar fuente"><Button
                variant="ghost"
                size="sm"
                icon={Trash2}
                onClick={() => setDeleteId(s.id)}
                className="text-muted-darker hover:text-danger"
                aria-label="Eliminar fuente"
              /></Tooltip>
            </span>
          </>
        )}
      />

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        loading={deleting}
        title="Eliminar fuente de contactos"
        description="Se dejará de revisar esta hoja. Los chats y contactos ya creados no se eliminan."
        confirmLabel="Eliminar"
        tone="danger"
        onConfirm={handleDelete}
      />
    </div>
  );
}

// useUrlTab lee `?tab=` con useSearchParams: la página va dentro de <Suspense>.
export default function CampaignsPage() {
  return (
    <Suspense fallback={null}>
      <CampaignsPageContent />
    </Suspense>
  );
}
