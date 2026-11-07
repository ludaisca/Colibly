"use client";

import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Plus, RefreshCw, Trash2, Share2, BadgeCheck } from "lucide-react";
import { MessengerIcon } from "@/app/components/ui/channel-icons";
import { Input } from "@/app/components/ui/input";
import { Select } from "@/app/components/ui/select";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { ConfirmDialog } from "@/app/components/ui/confirm-dialog";
import { DropdownItem } from "@/app/components/ui/dropdown";
import { PageHeader } from "@/app/components/ui/page-header";
import { EntityList, EntityRow } from "@/app/components/ui/entity-list";
import { EntityAvatar } from "@/app/components/ui/avatar";
import { useToast } from "@/app/components/ui/toast";
import { ChannelLimitBanner, useChannelLimit } from "@/app/components/billing/channel-limit";
import { MessengerCuentaFormModal } from "./_form";
import { useSession } from "next-auth/react";
import { ChannelAccountShareModal } from "@/app/components/channel-accounts/share-modal";
import { ChannelOwnerBadge, ChannelOwnerModal, type ChannelOwnerInfo } from "@/app/components/channel-accounts/owner-modal";
import { ChannelAvailabilityNotice, useChannelAvailability } from "@/app/components/channel-accounts/availability";

interface ChannelAccount {
  owner?: ChannelOwnerInfo | null;
  id: string;
  userId: string;
  name: string;
  channel: string;
  status: string;
  errorMessage: string | null;
  lastActivity: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { conversations: number };
}

const STATUS_BADGE: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  CONNECTED:    { label: "Conectada",   tone: "success" },
  PENDING:      { label: "Pendiente",    tone: "warning" },
  ERROR:        { label: "Error",        tone: "danger" },
  DISCONNECTED: { label: "Desconectada", tone: "neutral" },
};

export default function MessengerCuentasPage() {
  return (
    <Suspense fallback={null}>
      <MessengerCuentasView />
    </Suspense>
  );
}

function MessengerCuentasView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { success, error: toastError } = useToast();
  const [accounts, setAccounts] = useState<ChannelAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { data: session } = useSession();
  const { available, error: availabilityError } = useChannelAvailability("messenger");
  // Solo el admin dueño comparte; una cuenta compartida contigo se ve y se
  // atiende, pero no se comparte ni elimina desde aquí.
  const [shareAccount, setShareAccount] = useState<ChannelAccount | null>(null);
  const [ownerAccount, setOwnerAccount] = useState<ChannelAccount | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const openNewFromUrl = available === true && searchParams.get("nueva") === "1";

  // 1 conexión por ejecutivo (mismo cálculo que el candado del servidor).
  const { limit: channelLimit, refresh: refreshLimit } = useChannelLimit("messenger");

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/messenger/accounts");
      const data = await res.json();
      if (Array.isArray(data)) {
        setAccounts(data);
        refreshLimit();
      }
      else throw new Error(data.error ?? "Error al cargar cuentas");
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Error al cargar cuentas");
    } finally {
      setLoading(false);
    }
  }, [refreshLimit]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; fetchAccounts also used for manual refresh
    fetchAccounts();
  }, [fetchAccounts]);

  async function handleDelete() {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/messenger/accounts/${deleteId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Error al eliminar");
      }
      success("Página desconectada correctamente");
      setAccounts((prev) => prev.filter((a) => a.id !== deleteId));
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Error al eliminar");
    } finally {
      setDeleteId(null);
    }
  }

  const filtered = useMemo(() => accounts.filter((a) => {
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || a.name.toLowerCase().includes(q);
    if (!matchesSearch) return false;
    if (statusFilter && a.status !== statusFilter) return false;
    return true;
  }), [accounts, search, statusFilter]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Cuentas Messenger"
        description="Administra las Páginas de Facebook conectadas para mensajería de Messenger."
        actions={
          <>
            <Button variant="secondary" size="sm" icon={RefreshCw} onClick={fetchAccounts}>
              Actualizar
            </Button>
            <Button icon={Plus} size="sm" disabled={!available || channelLimit?.allowed === false} onClick={() => setFormOpen(true)}>Conectar Página</Button>
          </>
        }
      />

      <ChannelAvailabilityNotice available={available} error={availabilityError} />

      <ChannelLimitBanner limit={channelLimit} />

      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            icon={Search}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre…"
            className="sm:max-w-xs flex-1"
          />
          <Select
            aria-label="Filtrar por estado"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            placeholder="Todos los estados"
            className="sm:max-w-[180px]"
          >
            <option value="">Todos los estados</option>
            <option value="CONNECTED">Conectada</option>
            <option value="PENDING">Pendiente</option>
            <option value="ERROR">Error</option>
            <option value="DISCONNECTED">Desconectada</option>
          </Select>
        </div>

        <EntityList
          rows={filtered}
          rowKey={(a) => a.id}
          loading={loading}
          error={fetchError}
          onRetry={fetchAccounts}
          emptyIcon={MessengerIcon}
          emptyTitle={accounts.length === 0 ? "Sin Páginas conectadas" : "Sin resultados"}
          emptyDescription={
            accounts.length === 0
              ? "No has conectado ninguna Página de Facebook para Messenger. Conéctala desde Meta for Developers y agrégala aquí."
              : "No se encontraron cuentas con los filtros actuales."
          }
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
                subtitle={a.status === "ERROR" && a.errorMessage ? a.errorMessage : "Página de Messenger"}
                meta={
                  <>
                    <span>{a._count.conversations} chats</span>
                    <span className="font-mono">
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
      </div>

      <ChannelAccountShareModal open={!!shareAccount} onClose={() => setShareAccount(null)} account={shareAccount} />
      <ChannelOwnerModal open={!!ownerAccount} onClose={() => setOwnerAccount(null)} kind="channel" account={ownerAccount} onChanged={fetchAccounts} />

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Desconectar Página"
        description="Esta acción eliminará permanentemente la Página y todos sus chats y mensajes asociados. No se puede deshacer."
        confirmLabel="Eliminar"
        tone="danger"
        onConfirm={handleDelete}
      />

      <MessengerCuentaFormModal
        open={formOpen || openNewFromUrl}
        onClose={() => {
          setFormOpen(false);
          if (searchParams.get("nueva")) router.replace("/messenger/cuentas");
        }}
        onCreated={fetchAccounts}
      />
    </div>
  );
}
