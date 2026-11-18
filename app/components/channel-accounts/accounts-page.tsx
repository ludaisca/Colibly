"use client";

import { useState, useCallback, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Plus, RefreshCw, Trash2, Share2, BadgeCheck } from "lucide-react";
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
import { useSession } from "next-auth/react";
import { ChannelAccountShareModal } from "@/app/components/channel-accounts/share-modal";
import { ChannelOwnerBadge, ChannelOwnerModal, type ChannelOwnerInfo } from "@/app/components/channel-accounts/owner-modal";
import { ChannelAvailabilityNotice, useChannelAvailability } from "@/app/components/channel-accounts/availability";
import { plural } from "@/lib/format/plural";
import { useRunOnChange } from "@/app/components/ui/use-run-on-change";

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

type Tone = "success" | "warning" | "danger" | "neutral";

/** Lo que cambia entre las páginas de cuentas de Telegram, Messenger e Instagram. */
export interface ChannelAccountsPageConfig {
  slug: "telegram" | "messenger" | "instagram";
  title: string;
  icon: React.ElementType;
  /** "Conectada"/"Desconectada" (Página, cuenta) o "Conectado"/"Desconectado" (bot). */
  feminine: boolean;
  connectLabel: string;
  deletedToast: string;
  emptyTitle: string;
  emptyDescription: string;
  rowSubtitle: string;
  deleteTitle: string;
  deleteDescription: string;
  FormModal: React.ComponentType<{ open: boolean; onClose: () => void; onCreated: () => void }>;
}

function statusLabels(feminine: boolean): Record<string, { label: string; tone: Tone }> {
  const o = feminine ? "a" : "o";
  return {
    CONNECTED: { label: `Conectad${o}`, tone: "success" },
    PENDING: { label: "Pendiente", tone: "warning" },
    ERROR: { label: "Error", tone: "danger" },
    DISCONNECTED: { label: `Desconectad${o}`, tone: "neutral" },
  };
}

// Lista de cuentas de un canal genérico (/telegram/cuentas, /messenger/cuentas,
// /instagram/cuentas). Hasta 2026-11-17 cada canal tenía una copia de esta
// página que solo cambiaba textos, ícono y URL. El chat web y WhatsApp por QR
// tienen la suya (snippet del widget, QR).
export function ChannelAccountsPage({ config }: { config: ChannelAccountsPageConfig }) {
  return (
    <Suspense fallback={null}>
      <ChannelAccountsView config={config} />
    </Suspense>
  );
}

function ChannelAccountsView({ config }: { config: ChannelAccountsPageConfig }) {
  const { slug, FormModal } = config;
  const STATUS_BADGE = statusLabels(config.feminine);
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
  const { available, error: availabilityError } = useChannelAvailability(slug);
  // Solo el admin dueño comparte; una cuenta compartida contigo se ve y se
  // atiende, pero no se comparte ni elimina desde aquí.
  const [shareAccount, setShareAccount] = useState<ChannelAccount | null>(null);
  const [ownerAccount, setOwnerAccount] = useState<ChannelAccount | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const openNewFromUrl = available === true && searchParams.get("nueva") === "1";

  // 1 conexión por ejecutivo (mismo cálculo que el candado del servidor).
  const { limit: channelLimit, refresh: refreshLimit } = useChannelLimit(slug);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(`/api/${slug}/accounts`);
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
  }, [refreshLimit, slug]);

  useRunOnChange(() => fetchAccounts(), [fetchAccounts]);

  async function handleDelete() {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/${slug}/accounts/${deleteId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Error al eliminar");
      }
      success(config.deletedToast);
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
        title={config.title}
        actions={
          <>
            <Button variant="secondary" size="sm" icon={RefreshCw} onClick={fetchAccounts}>
              Actualizar
            </Button>
            <Button icon={Plus} size="sm" disabled={!available || channelLimit?.allowed === false} onClick={() => setFormOpen(true)}>{config.connectLabel}</Button>
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
            <option value="CONNECTED">{STATUS_BADGE.CONNECTED.label}</option>
            <option value="PENDING">Pendiente</option>
            <option value="ERROR">Error</option>
            <option value="DISCONNECTED">{STATUS_BADGE.DISCONNECTED.label}</option>
          </Select>
        </div>

        <EntityList
          rows={filtered}
          rowKey={(a) => a.id}
          loading={loading}
          error={fetchError}
          onRetry={fetchAccounts}
          emptyIcon={config.icon}
          emptyTitle={accounts.length === 0 ? config.emptyTitle : "Sin resultados"}
          emptyDescription={
            accounts.length === 0
              ? config.emptyDescription
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
                subtitle={a.status === "ERROR" && a.errorMessage ? a.errorMessage : config.rowSubtitle}
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
      </div>

      <ChannelAccountShareModal open={!!shareAccount} onClose={() => setShareAccount(null)} account={shareAccount} />
      <ChannelOwnerModal open={!!ownerAccount} onClose={() => setOwnerAccount(null)} kind="channel" account={ownerAccount} onChanged={fetchAccounts} />

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        title={config.deleteTitle}
        description={config.deleteDescription}
        confirmLabel="Eliminar"
        tone="danger"
        onConfirm={handleDelete}
      />

      <FormModal
        open={formOpen || openNewFromUrl}
        onClose={() => {
          setFormOpen(false);
          if (searchParams.get("nueva")) router.replace(`/${slug}/cuentas`);
        }}
        onCreated={fetchAccounts}
      />
    </div>
  );
}
