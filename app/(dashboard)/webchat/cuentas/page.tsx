"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Globe, Trash2 } from "lucide-react";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { ConfirmDialog } from "@/app/components/ui/confirm-dialog";
import { DropdownItem } from "@/app/components/ui/dropdown";
import { PageHeader } from "@/app/components/ui/page-header";
import { EntityList, EntityRow } from "@/app/components/ui/entity-list";
import { EntityAvatar } from "@/app/components/ui/avatar";
import { useToast } from "@/app/components/ui/toast";
import { WebchatCuentaFormModal } from "./_form";

interface ChannelAccount {
  id: string;
  name: string;
  status: string;
  errorMessage: string | null;
  lastActivity: string | null;
  createdAt: string;
  _count: { conversations: number };
}

const STATUS_BADGE: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  CONNECTED:    { label: "Conectado",   tone: "success" },
  PENDING:      { label: "Pendiente",    tone: "warning" },
  ERROR:        { label: "Error",        tone: "danger" },
  DISCONNECTED: { label: "Desconectado", tone: "neutral" },
};

export default function WebchatCuentasPage() {
  const { success, error: toastError } = useToast();
  const [accounts, setAccounts] = useState<ChannelAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/webchat/accounts");
      const data = await res.json();
      if (Array.isArray(data)) setAccounts(data);
      else throw new Error(data.error ?? "Error al cargar cuentas");
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Error al cargar cuentas");
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; fetchAccounts also used for manual refresh
  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  async function handleDelete() {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/webchat/accounts/${deleteId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Error al eliminar");
      }
      success("Cuenta eliminada");
      setAccounts((prev) => prev.filter((a) => a.id !== deleteId));
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Error al eliminar");
    } finally {
      setDeleteId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cuentas Web"
        description="Widget de chat en vivo embebible en tu sitio web — el visitante escribe sin necesitar cuenta, la conversación llega al mismo inbox."
        actions={
          <Button icon={Plus} size="sm" onClick={() => { setEditId(null); setFormOpen(true); }}>
            Nueva cuenta web
          </Button>
        }
      />

      <EntityList
        rows={accounts}
        rowKey={(a) => a.id}
        loading={loading}
        error={fetchError}
        onRetry={fetchAccounts}
        emptyIcon={Globe}
        emptyTitle="Sin cuentas web"
        emptyDescription="Crea una cuenta para obtener el script embebible del widget de chat en vivo."
        onRowClick={(a) => { setEditId(a.id); setFormOpen(true); }}
        rowActions={(a) => (
          <DropdownItem icon={Trash2} onClick={() => setDeleteId(a.id)}>
            Eliminar
          </DropdownItem>
        )}
        renderRow={(a) => {
          const badge = STATUS_BADGE[a.status] ?? { label: a.status, tone: "neutral" as const };
          return (
            <EntityRow
              leading={<EntityAvatar id={a.id} name={a.name} size="sm" />}
              title={a.name}
              badges={<Badge tone={badge.tone} size="sm">{badge.label}</Badge>}
              subtitle={a.status === "ERROR" && a.errorMessage ? a.errorMessage : "Widget de sitio web"}
              meta={
                <>
                  <span>{a._count.conversations} chats</span>
                  <span className="tabular-nums">
                    {a.lastActivity
                      ? new Date(a.lastActivity).toLocaleDateString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
                      : "—"}
                  </span>
                </>
              }
            />
          );
        }}
      />

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Eliminar cuenta web"
        description="Esta acción eliminará permanentemente la cuenta y todos sus chats y mensajes asociados. El widget deja de funcionar de inmediato en el sitio del cliente. No se puede deshacer."
        confirmLabel="Eliminar"
        tone="danger"
        onConfirm={handleDelete}
      />

      <WebchatCuentaFormModal
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditId(null); }}
        editId={editId}
        onSaved={fetchAccounts}
      />
    </div>
  );
}
