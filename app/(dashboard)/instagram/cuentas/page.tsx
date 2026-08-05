"use client";

import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Plus, RefreshCw, Camera, Trash2 } from "lucide-react";
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
import { InstagramCuentaFormModal } from "./_form";

interface ChannelAccount {
  id: string;
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

export default function InstagramCuentasPage() {
  return (
    <Suspense fallback={null}>
      <InstagramCuentasView />
    </Suspense>
  );
}

function InstagramCuentasView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { success, error: toastError } = useToast();
  const [accounts, setAccounts] = useState<ChannelAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(searchParams.get("nueva") === "1");

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/instagram/accounts");
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
      const res = await fetch(`/api/instagram/accounts/${deleteId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Error al eliminar");
      }
      success("Cuenta desconectada correctamente");
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
    <div className="space-y-6">
      <PageHeader
        title="Cuentas Instagram"
        description="Administra las cuentas profesionales de Instagram conectadas para mensajería directa."
        actions={
          <>
            <Button variant="secondary" size="sm" icon={RefreshCw} onClick={fetchAccounts}>
              Actualizar
            </Button>
            <Button icon={Plus} size="sm" onClick={() => setFormOpen(true)}>Conectar cuenta</Button>
          </>
        }
      />

      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            icon={Search}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre..."
            className="sm:max-w-xs flex-1"
          />
          <Select
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
          emptyIcon={Camera}
          emptyTitle={accounts.length === 0 ? "Sin cuentas conectadas" : "Sin resultados"}
          emptyDescription={
            accounts.length === 0
              ? "No has conectado ninguna cuenta de Instagram. Debe estar vinculada a una Página de Facebook (modelo clásico) — conéctala desde Meta for Developers y agrégala aquí."
              : "No se encontraron cuentas con los filtros actuales."
          }
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
                subtitle={a.status === "ERROR" && a.errorMessage ? a.errorMessage : "Cuenta de Instagram"}
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

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Desconectar cuenta"
        description="Esta acción eliminará permanentemente la cuenta y todos sus chats y mensajes asociados. No se puede deshacer."
        confirmLabel="Eliminar"
        tone="danger"
        onConfirm={handleDelete}
      />

      <InstagramCuentaFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          if (searchParams.get("nueva")) router.replace("/instagram/cuentas");
        }}
        onCreated={fetchAccounts}
      />
    </div>
  );
}
