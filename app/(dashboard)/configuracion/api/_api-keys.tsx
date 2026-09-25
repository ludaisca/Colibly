"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Plus, Ban, Trash2 } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
import { EntityList, EntityRow } from "@/app/components/ui/entity-list";
import { DropdownItem } from "@/app/components/ui/dropdown";
import { ConfirmDialog } from "@/app/components/ui/confirm-dialog";
import { SectionHeader } from "@/app/components/ui/section-header";
import { useToast } from "@/app/components/ui/toast";
import { ApiKeyFormModal } from "./_api-key-form";
import { formatDateTime, scopeSummary, type IntegrationAccount } from "./_shared";

interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  accountIds: string[];
  channelAccountIds: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

function keyState(k: ApiKeyRow): { label: string; tone: "success" | "danger" | "neutral" } {
  if (k.revokedAt) return { label: "Revocada", tone: "danger" };
  if (k.expiresAt && new Date(k.expiresAt) <= new Date()) return { label: "Expirada", tone: "neutral" };
  return { label: "Activa", tone: "success" };
}

export function ApiKeysSection({ accounts }: { accounts: IntegrationAccount[] }) {
  const { success, error: toastError } = useToast();
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [revoking, setRevoking] = useState<ApiKeyRow | null>(null);
  const [deleting, setDeleting] = useState<ApiKeyRow | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/configuracion/api-keys");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al cargar las API keys");
      setKeys(data);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Error al cargar las API keys");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; fetchKeys también refresca tras crear/revocar
    fetchKeys();
  }, [fetchKeys]);

  async function handleRevoke() {
    if (!revoking) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/configuracion/api-keys/${revoking.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revoked: true }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "No se pudo revocar");
      success("API key revocada: deja de funcionar de inmediato");
      setRevoking(null);
      fetchKeys();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "No se pudo revocar");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/configuracion/api-keys/${deleting.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "No se pudo eliminar");
      success("API key eliminada");
      setDeleting(null);
      fetchKeys();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "No se pudo eliminar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4">
      <SectionHeader
        eyebrow="Acceso a la API"
        title="API keys"
        action={<Button size="sm" icon={Plus} onClick={() => setCreateOpen(true)}>Nueva key</Button>}
      />
      <p className="text-sm text-muted">
        Una API key actúa con tu acceso, recortado a los permisos y cuentas que elijas. Si dejas de ser admin o se desactiva tu
        usuario, tus keys dejan de funcionar.
      </p>

      <EntityList
        rows={keys}
        rowKey={(k) => k.id}
        loading={loading}
        error={fetchError}
        onRetry={fetchKeys}
        emptyIcon={KeyRound}
        emptyTitle="Sin API keys"
        emptyDescription="Crea una para conectar tu ERP, tu tienda o Zapier/Make."
        emptyAction={<Button size="sm" icon={Plus} onClick={() => setCreateOpen(true)}>Nueva key</Button>}
        renderRow={(k) => {
          const state = keyState(k);
          return (
            <EntityRow
              leading={<KeyRound size={18} className="text-muted" />}
              title={k.name}
              subtitle={
                <span className="font-mono">
                  {k.prefix}… · {k.scopes.length} permiso{k.scopes.length === 1 ? "" : "s"} ·{" "}
                  {scopeSummary(k.accountIds, k.channelAccountIds, accounts)}
                </span>
              }
              badges={<Badge size="sm" tone={state.tone}>{state.label}</Badge>}
              meta={k.lastUsedAt ? `Usada ${formatDateTime(k.lastUsedAt)}` : "Sin uso"}
            />
          );
        }}
        rowActions={(k) => (
          <>
            {!k.revokedAt && (
              <DropdownItem icon={Ban} onClick={() => setRevoking(k)}>Revocar</DropdownItem>
            )}
            <DropdownItem icon={Trash2} danger onClick={() => setDeleting(k)}>Eliminar</DropdownItem>
          </>
        )}
      />

      <ApiKeyFormModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={fetchKeys} accounts={accounts} />

      <ConfirmDialog
        open={!!revoking}
        onClose={() => setRevoking(null)}
        onConfirm={handleRevoke}
        loading={busy}
        tone="warning"
        title={`¿Revocar “${revoking?.name}”?`}
        description="Las integraciones que la usan dejarán de funcionar de inmediato. No se puede deshacer."
        confirmLabel="Revocar"
      />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        loading={busy}
        title={`¿Eliminar “${deleting?.name}”?`}
        description="Se borra de la lista y deja de funcionar. Si solo quieres cortar el acceso, revócala: queda registro."
        confirmLabel="Eliminar"
      />
    </section>
  );
}
