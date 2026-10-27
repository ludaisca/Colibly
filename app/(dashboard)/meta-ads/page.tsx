"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, RefreshCw, Trash2, Settings2, AlertTriangle } from "lucide-react";
import { MetaIcon } from "@/app/components/ui/brand-marks";
import { Input } from "@/app/components/ui/input";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { ConfirmDialog } from "@/app/components/ui/confirm-dialog";
import { DropdownItem } from "@/app/components/ui/dropdown";
import { PageHeader } from "@/app/components/ui/page-header";
import { EntityList, EntityRow } from "@/app/components/ui/entity-list";
import { EntityAvatar } from "@/app/components/ui/avatar";
import { useToast } from "@/app/components/ui/toast";
import { MetaAdsAccountFormModal, type MetaAdsAccountDetail } from "./_form";

interface MetaAdsAccountRow {
  id: string;
  name: string;
  pageId: string;
  status: string;
  errorMessage: string | null;
  mode: "TEST" | "LIVE";
  datasetId: string | null;
  waAccountId: string | null;
  waAccount: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  _count: { contacts: number };
  driftCount: number;
  hasAppSecret: boolean;
  hasCapiAccessToken: boolean;
}

const STATUS_BADGE: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  CONNECTED:    { label: "Conectado",   tone: "success" },
  PENDING:      { label: "Pendiente",    tone: "warning" },
  ERROR:        { label: "Error",        tone: "danger" },
  DISCONNECTED: { label: "Desconectado", tone: "neutral" },
};

export default function MetaAdsPage() {
  const { success, error: toastError } = useToast();
  const [accounts, setAccounts] = useState<MetaAdsAccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MetaAdsAccountDetail | null>(null);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/meta/accounts");
      const data = await res.json();
      if (Array.isArray(data)) setAccounts(data);
      else throw new Error(data.error ?? "Error al cargar cuentas");
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Error al cargar cuentas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; fetchAccounts also used for manual refresh
    fetchAccounts();
  }, [fetchAccounts]);

  async function handleDelete() {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/meta/accounts/${deleteId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Error al eliminar");
      }
      success("Cuenta eliminada correctamente");
      setAccounts((prev) => prev.filter((a) => a.id !== deleteId));
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Error al eliminar");
    } finally {
      setDeleteId(null);
    }
  }

  async function openEdit(row: MetaAdsAccountRow) {
    try {
      const res = await fetch(`/api/meta/accounts/${row.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al cargar la cuenta");
      setEditing({
        id: data.id,
        name: data.name,
        pageId: data.pageId,
        mode: data.mode,
        testEventCode: data.testEventCode,
        datasetId: data.datasetId,
        waAccountId: data.waAccountId,
        hasCapiAccessToken: data.hasCapiAccessToken,
      });
      setFormOpen(true);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Error al cargar la cuenta");
    }
  }

  const filtered = useMemo(() => accounts.filter((a) => {
    const q = search.trim().toLowerCase();
    return !q || a.name.toLowerCase().includes(q) || a.pageId.includes(q);
  }), [accounts, search]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Meta Ads"
        description="Cuentas de Página/Business para el feedback loop de calificación de leads (Instant Forms + click-to-WhatsApp)."
        actions={
          <>
            <Button variant="secondary" size="sm" icon={RefreshCw} onClick={fetchAccounts}>
              Actualizar
            </Button>
            <Button icon={Plus} size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
              Conectar cuenta
            </Button>
          </>
        }
      />

      <div className="space-y-4">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o Page ID..."
          className="sm:max-w-xs"
        />

        <EntityList
          rows={filtered}
          rowKey={(a) => a.id}
          loading={loading}
          error={fetchError}
          onRetry={fetchAccounts}
          onRowClick={(a) => openEdit(a)}
          emptyIcon={MetaIcon}
          emptyTitle={accounts.length === 0 ? "Sin cuentas" : "Sin resultados"}
          emptyDescription={
            accounts.length === 0
              ? "No has conectado ninguna cuenta de Meta Ads. Conéctala para empezar a reportar calidad de leads."
              : "No se encontraron cuentas con los filtros actuales."
          }
          rowActions={(a) => (
            <>
              <DropdownItem icon={Settings2} onClick={() => openEdit(a)}>
                Editar
              </DropdownItem>
              <DropdownItem icon={Trash2} onClick={() => setDeleteId(a.id)}>
                Eliminar
              </DropdownItem>
            </>
          )}
          renderRow={(a) => {
            const badge = STATUS_BADGE[a.status] ?? { label: a.status, tone: "neutral" as const };
            return (
              <EntityRow
                leading={<EntityAvatar id={a.id} name={a.name} size="sm" />}
                title={a.name}
                badges={
                  <>
                    <Badge tone={badge.tone} size="sm">{badge.label}</Badge>
                    <Badge tone={a.mode === "LIVE" ? "success" : "warning"} size="sm">
                      {a.mode === "LIVE" ? "LIVE" : "TEST"}
                    </Badge>
                    {!a.hasAppSecret && <Badge tone="danger" size="sm">Sin App Secret</Badge>}
                    {!a.hasCapiAccessToken && <Badge tone="warning" size="sm">Sin token CAPI</Badge>}
                    {a.driftCount > 0 && (
                      <Badge tone="warning" size="sm">
                        <AlertTriangle size={12} className="mr-1 inline" />
                        {a.driftCount} sin match
                      </Badge>
                    )}
                  </>
                }
                subtitle={
                  <>
                    <span className="font-mono">{a.pageId}</span>
                    {a.waAccount ? <> · sigue en {a.waAccount.name}</> : <> · sin WhatsApp vinculado</>}
                    {a.status === "ERROR" && a.errorMessage && <> · {a.errorMessage}</>}
                  </>
                }
                meta={<span>{a._count.contacts} leads</span>}
              />
            );
          }}
        />
      </div>

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Eliminar cuenta"
        description="Esta acción elimina la config de esta Página de Meta Ads. Los contactos ya atribuidos conservan su historial (leadOrigin/metaLeadId), pero dejan de recibir feedback. No se puede deshacer."
        confirmLabel="Eliminar"
        tone="danger"
        onConfirm={handleDelete}
      />

      <MetaAdsAccountFormModal
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        onSaved={fetchAccounts}
        initialData={editing}
      />
    </div>
  );
}
