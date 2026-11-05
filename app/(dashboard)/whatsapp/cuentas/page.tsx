"use client";

import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Search, Plus, RefreshCw, Trash2, Settings2 } from "lucide-react";
import { WhatsAppIcon } from "@/app/components/ui/channel-icons";
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
import { CuentaFormModal } from "./_form";
import { ConectarWhatsAppModal } from "./_conectar-whatsapp";
import { ChannelOwnerBadge, type ChannelOwnerInfo } from "@/app/components/channel-accounts/owner-modal";

interface WaAccount {
  owner?: ChannelOwnerInfo | null;
  id: string;
  userId: string;
  name: string;
  channel: string;
  phoneNumber: string | null;
  phoneNumberId: string | null;
  wabaId: string | null;
  status: string;
  errorMessage: string | null;
  lastActivity: string | null;
  hasAppSecret: boolean;
  connectionType: "MANUAL" | "EMBEDDED_SIGNUP";
  coexistence: boolean;
  createdAt: string;
  updatedAt: string;
  _count: { chats: number };
}

const STATUS_BADGE: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  CONNECTED:    { label: "Conectado",   tone: "success" },
  PENDING:      { label: "Pendiente",    tone: "warning" },
  ERROR:        { label: "Error",        tone: "danger" },
  DISCONNECTED: { label: "Desconectado", tone: "neutral" },
};

export default function CuentasPage() {
  return (
    <Suspense fallback={null}>
      <CuentasView />
    </Suspense>
  );
}

function CuentasView() {
  const router = useRouter();
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const { success, error: toastError } = useToast();
  const [accounts, setAccounts] = useState<WaAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(searchParams.get("nueva") === "1");
  const [connectOpen, setConnectOpen] = useState(false);

  // 1 conexión por ejecutivo (mismo cálculo que el candado del servidor).
  const { limit: channelLimit, refresh: refreshLimit } = useChannelLimit("whatsapp");

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/whatsapp/accounts");
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
      const res = await fetch(`/api/whatsapp/accounts/${deleteId}`, { method: "DELETE" });
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

  const filtered = useMemo(() => accounts.filter((a) => {
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || a.name.toLowerCase().includes(q) || (a.phoneNumber?.toLowerCase().includes(q) ?? false);
    if (!matchesSearch) return false;
    if (statusFilter && a.status !== statusFilter) return false;
    return true;
  }), [accounts, search, statusFilter]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Cuentas WhatsApp"
        description="Administra los números de WhatsApp Business conectados."
        actions={
          <>
            <Button variant="secondary" size="sm" icon={RefreshCw} onClick={fetchAccounts}>
              Actualizar
            </Button>
            <Button variant="secondary" icon={Plus} size="sm" disabled={channelLimit?.allowed === false} onClick={() => setFormOpen(true)}>Conexión manual</Button>
            <Button icon={Plus} size="sm" disabled={channelLimit?.allowed === false} onClick={() => setConnectOpen(true)}>Conectar WhatsApp</Button>
          </>
        }
      />

      <ChannelLimitBanner limit={channelLimit} />

      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            icon={Search}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o número..."
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
            <option value="CONNECTED">Conectado</option>
            <option value="PENDING">Pendiente</option>
            <option value="ERROR">Error</option>
            <option value="DISCONNECTED">Desconectado</option>
          </Select>
        </div>

        <EntityList
          rows={filtered}
          rowKey={(a) => a.id}
          loading={loading}
          error={fetchError}
          onRetry={fetchAccounts}
          onRowClick={(a) => router.push(`/whatsapp/cuentas/${a.id}`)}
          emptyIcon={WhatsAppIcon}
          emptyTitle={accounts.length === 0 ? "Sin cuentas" : "Sin resultados"}
          emptyDescription={
            accounts.length === 0
              ? "No has agregado ninguna cuenta de WhatsApp. Conecta tu primer número para empezar."
              : "No se encontraron cuentas con los filtros actuales."
          }
          rowActions={(a) => (
            <>
              <DropdownItem icon={Settings2} onClick={() => router.push(`/whatsapp/cuentas/${a.id}`)}>
                Detalles
              </DropdownItem>
              {(session?.user?.role === "admin" || a.userId === session?.user?.id) && (
                <DropdownItem icon={Trash2} onClick={() => setDeleteId(a.id)}>
                  Eliminar
                </DropdownItem>
              )}
            </>
          )}
          renderRow={(a) => {
            const badge = STATUS_BADGE[a.status] ?? { label: a.status, tone: "neutral" as const };
            return (
              <EntityRow
                leading={<EntityAvatar id={a.id} name={a.name} size="sm" />}
                title={
                  <Link
                    href={`/whatsapp/cuentas/${a.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="hover:text-accent-ink transition-colors"
                  >
                    {a.name}
                  </Link>
                }
                badges={
                  <>
                    <Badge tone={badge.tone} size="sm">{badge.label}</Badge>
                    <ChannelOwnerBadge owner={a.owner} />
                    {!a.hasAppSecret && <Badge tone="danger" size="sm">Sin App Secret</Badge>}
                    {a.coexistence && <Badge tone="neutral" size="sm">App WhatsApp Business</Badge>}
                  </>
                }
                subtitle={
                  <>
                    <span className="font-mono">{a.phoneNumber ?? "—"}</span>
                    {a.status === "ERROR" && a.errorMessage && <> · {a.errorMessage}</>}
                  </>
                }
                meta={
                  <>
                    <span>{a._count.chats} chats</span>
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

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Eliminar cuenta"
        description="Esta acción eliminará permanentemente la cuenta y todos sus chats y mensajes asociados. No se puede deshacer."
        confirmLabel="Eliminar"
        tone="danger"
        onConfirm={handleDelete}
      />

      <ConectarWhatsAppModal open={connectOpen} onClose={() => setConnectOpen(false)} onConnected={fetchAccounts} />
      <CuentaFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          if (searchParams.get("nueva")) router.replace("/whatsapp/cuentas");
        }}
        onCreated={fetchAccounts}
      />
    </div>
  );
}
