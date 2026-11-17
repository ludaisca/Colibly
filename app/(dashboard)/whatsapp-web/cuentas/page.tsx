"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw, Trash2, QrCode, Share2, BadgeCheck } from "lucide-react";
import { useSession } from "next-auth/react";
import { WhatsAppIcon } from "@/app/components/ui/channel-icons";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { ConfirmDialog } from "@/app/components/ui/confirm-dialog";
import { DropdownItem } from "@/app/components/ui/dropdown";
import { PageHeader } from "@/app/components/ui/page-header";
import { EntityList, EntityRow } from "@/app/components/ui/entity-list";
import { EntityAvatar } from "@/app/components/ui/avatar";
import { useToast } from "@/app/components/ui/toast";
import { ChannelAccountShareModal } from "@/app/components/channel-accounts/share-modal";
import { ChannelOwnerBadge, ChannelOwnerModal, type ChannelOwnerInfo } from "@/app/components/channel-accounts/owner-modal";
import { plural } from "@/lib/format/plural";
import { BRAND_NAME } from "@/lib/brand";
import { WhatsappWebLinkModal, WhatsappWebNewModal } from "./_form";

// WhatsApp por QR (GoWA, no oficial). Solo llega aquí quien tiene el canal
// habilitado por el operador (layout.tsx). Detalle: docs/arquitectura/canales.md.

interface Account {
  id: string;
  userId: string;
  owner?: ChannelOwnerInfo | null;
  name: string;
  channel: string;
  status: string;
  errorMessage: string | null;
  externalAccountId: string | null;
  lastActivity: string | null;
  _count: { conversations: number };
}

const STATUS_BADGE: Record<string, { label: string; tone: "success" | "danger" | "neutral" }> = {
  CONNECTED: { label: "Conectado", tone: "success" },
  PENDING: { label: "Sin vincular", tone: "neutral" },
  ERROR: { label: "Desconectado", tone: "danger" },
  DISCONNECTED: { label: "Desconectado", tone: "neutral" },
};

export default function WhatsappWebCuentasPage() {
  const { success, error: toastError } = useToast();
  const { data: session } = useSession();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [linking, setLinking] = useState<{ id: string; name: string } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [shareAccount, setShareAccount] = useState<Account | null>(null);
  const [ownerAccount, setOwnerAccount] = useState<Account | null>(null);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/whatsapp-web/accounts");
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error(data.error ?? "Error al cargar cuentas");
      setAccounts(data);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Error al cargar cuentas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; también se usa para refrescar
    fetchAccounts();
  }, [fetchAccounts]);

  async function handleDelete() {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/whatsapp-web/accounts/${deleteId}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Error al eliminar");
      success("Número desvinculado");
      setAccounts((prev) => prev.filter((a) => a.id !== deleteId));
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Error al eliminar");
    } finally {
      setDeleteId(null);
    }
  }

  const canManage = (a: Account) => session?.user?.role === "admin" || a.userId === session?.user?.id;

  return (
    <div className="space-y-5">
      <PageHeader
        title="WhatsApp por QR"
        actions={
          <>
            <Button variant="secondary" size="sm" icon={RefreshCw} onClick={fetchAccounts}>Actualizar</Button>
            <Button icon={Plus} size="sm" onClick={() => setNewOpen(true)}>Conectar número</Button>
          </>
        }
      />

      <EntityList
        rows={accounts}
        rowKey={(a) => a.id}
        loading={loading}
        error={fetchError}
        onRetry={fetchAccounts}
        emptyIcon={WhatsAppIcon}
        emptyTitle="Sin números vinculados"
        emptyDescription="Vincula un número escaneando un código QR desde su WhatsApp."
        rowActions={(a) =>
          canManage(a) ? (
            <>
              {a.status !== "CONNECTED" && (
                <DropdownItem icon={QrCode} onClick={() => setLinking({ id: a.id, name: a.name })}>Vincular</DropdownItem>
              )}
              {session?.user?.role === "admin" && (
                <DropdownItem icon={BadgeCheck} onClick={() => setOwnerAccount(a)}>Dueño (licencia)</DropdownItem>
              )}
              {session?.user?.role === "admin" && (
                <DropdownItem icon={Share2} onClick={() => setShareAccount(a)}>Compartir</DropdownItem>
              )}
              <DropdownItem icon={Trash2} onClick={() => setDeleteId(a.id)}>Eliminar</DropdownItem>
            </>
          ) : (
            <DropdownItem icon={Share2} disabled>Compartida contigo</DropdownItem>
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
              subtitle={a.errorMessage ?? (a.externalAccountId ? `+${a.externalAccountId}` : "Falta escanear el código QR")}
              meta={
                <>
                  <span>{plural(a._count.conversations, "chat")}</span>
                  <span className="tabular-nums">
                    {a.lastActivity ? new Date(a.lastActivity).toLocaleDateString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
                  </span>
                </>
              }
            />
          );
        }}
      />

      <WhatsappWebNewModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={(account) => {
          setNewOpen(false);
          setLinking(account);
          void fetchAccounts();
        }}
      />
      <WhatsappWebLinkModal account={linking} onClose={() => setLinking(null)} onConnected={fetchAccounts} />

      <ChannelAccountShareModal open={!!shareAccount} onClose={() => setShareAccount(null)} account={shareAccount} />
      <ChannelOwnerModal open={!!ownerAccount} onClose={() => setOwnerAccount(null)} kind="channel" account={ownerAccount} onChanged={fetchAccounts} />

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Eliminar número"
        description={`Se cierra la sesión de WhatsApp en ese teléfono y se borran sus chats y mensajes de ${BRAND_NAME}. No se puede deshacer.`}
        confirmLabel="Eliminar"
        tone="danger"
        onConfirm={handleDelete}
      />
    </div>
  );
}
