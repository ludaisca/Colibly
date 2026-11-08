"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Share2, BadgeCheck } from "lucide-react";
import { WebchatIcon } from "@/app/components/ui/channel-icons";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { ConfirmDialog } from "@/app/components/ui/confirm-dialog";
import { DropdownItem } from "@/app/components/ui/dropdown";
import { PageHeader } from "@/app/components/ui/page-header";
import { EntityList, EntityRow } from "@/app/components/ui/entity-list";
import { EntityAvatar } from "@/app/components/ui/avatar";
import { useToast } from "@/app/components/ui/toast";
import { ChannelAvailabilityNotice, useChannelAvailability } from "@/app/components/channel-accounts/availability";
import { WebchatCuentaFormModal } from "./_form";
import { useSession } from "next-auth/react";
import { ChannelAccountShareModal } from "@/app/components/channel-accounts/share-modal";
import { ChannelOwnerBadge, ChannelOwnerModal, type ChannelOwnerInfo } from "@/app/components/channel-accounts/owner-modal";
import { plural } from "@/lib/format/plural";

interface ChannelAccount {
  owner?: ChannelOwnerInfo | null;
  id: string;
  userId: string;
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
  const { available, error: availabilityError } = useChannelAvailability("webchat");
  const [accounts, setAccounts] = useState<ChannelAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { data: session } = useSession();
  // Solo el admin dueño comparte; una cuenta compartida contigo se ve y se
  // atiende, pero no se comparte ni elimina desde aquí.
  const [shareAccount, setShareAccount] = useState<ChannelAccount | null>(null);
  const [ownerAccount, setOwnerAccount] = useState<ChannelAccount | null>(null);
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
    <div className="space-y-5">
      <PageHeader
        title="Cuentas Web"
        description="Widget de chat en vivo embebible en tu sitio web — el visitante escribe sin necesitar cuenta, la conversación llega al mismo inbox."
        actions={
          <Button icon={Plus} size="sm" disabled={!available} onClick={() => { setEditId(null); setFormOpen(true); }}>
            Nueva cuenta web
          </Button>
        }
      />

      <ChannelAvailabilityNotice available={available} error={availabilityError} />

      <EntityList
        rows={accounts}
        rowKey={(a) => a.id}
        loading={loading}
        error={fetchError}
        onRetry={fetchAccounts}
        emptyIcon={WebchatIcon}
        emptyTitle="Sin cuentas web"
        emptyDescription="Crea una cuenta para obtener el script embebible del widget de chat en vivo."
        onRowClick={(a) => {
          if (session?.user?.role !== "admin" && a.userId !== session?.user?.id) return;
          setEditId(a.id);
          setFormOpen(true);
        }}
        rowActions={(a) =>
          session?.user?.role === "admin" || a.userId === session?.user?.id ? (
            <>
              {session?.user?.role === "admin" && (
                <DropdownItem icon={BadgeCheck} onClick={() => setOwnerAccount(a)}>
                    Dueño (licencia)
                  </DropdownItem>
                )}
                {session?.user?.role === "admin" && (
                  <DropdownItem icon={Share2} onClick={() => setShareAccount(a)}>
                  Compartir
                </DropdownItem>
              )}
              <DropdownItem icon={Trash2} onClick={() => setDeleteId(a.id)}>
                Eliminar
              </DropdownItem>
            </>
          ) : (
            <DropdownItem icon={Share2} disabled>
              Compartida contigo
            </DropdownItem>
          )
        }
        renderRow={(a) => {
          const badge = STATUS_BADGE[a.status] ?? { label: a.status, tone: "neutral" as const };
          return (
            <EntityRow
              leading={<EntityAvatar id={a.id} name={a.name} size="sm" />}
              title={a.name}
              badges={
                  <>
                    <Badge tone={badge.tone} size="sm">{badge.label}</Badge>
                    <ChannelOwnerBadge owner={a.owner} />
                  </>
                }
              subtitle={a.status === "ERROR" && a.errorMessage ? a.errorMessage : "Widget de sitio web"}
              meta={
                <>
                  <span>{plural(a._count.conversations, "chat")}</span>
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

      <ChannelAccountShareModal open={!!shareAccount} onClose={() => setShareAccount(null)} account={shareAccount} />
      <ChannelOwnerModal open={!!ownerAccount} onClose={() => setOwnerAccount(null)} kind="channel" account={ownerAccount} onChanged={fetchAccounts} />

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
