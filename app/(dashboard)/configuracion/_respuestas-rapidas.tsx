"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, MessageSquareDashed, Trash2, Pencil } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Select } from "@/app/components/ui/select";
import { ConfirmDialog } from "@/app/components/ui/confirm-dialog";
import { DropdownItem } from "@/app/components/ui/dropdown";
import { Table, type TableColumn } from "@/app/components/ui/table";
import { SectionHeader } from "@/app/components/ui/section-header";
import { Card } from "@/app/components/ui/card";
import { useToast } from "@/app/components/ui/toast";
import { CannedResponseFormModal } from "./_respuestas-rapidas-form";

// Sección embebida en /configuracion — antes era la página propia
// /configuracion/respuestas-rapidas, degradada a sección porque el CRUD es
// chico y no ameritaba un nivel más de navegación.

interface Account { id: string; name: string; channel: "WHATSAPP" | "TELEGRAM"; }

interface CannedResponse {
  id: string;
  shortcut: string;
  content: string;
  waAccountId: string | null;
  channelAccountId: string | null;
}

export function RespuestasRapidasSection() {
  const { success, error: toastError } = useToast();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [items, setItems] = useState<CannedResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CannedResponse | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/whatsapp/accounts").then((r) => r.json()),
      fetch("/api/telegram/accounts").then((r) => r.json()),
    ])
      .then(([wa, tg]) => {
        const merged: Account[] = [
          ...(Array.isArray(wa) ? wa.map((a: { id: string; name: string }) => ({ id: a.id, name: a.name, channel: "WHATSAPP" as const })) : []),
          ...(Array.isArray(tg) ? tg.map((a: { id: string; name: string }) => ({ id: a.id, name: a.name, channel: "TELEGRAM" as const })) : []),
        ];
        setAccounts(merged);
        // Como en Atributos: se preselecciona la primera cuenta (antes solo con una).
        setSelectedAccountId((current) => current || merged[0]?.id || "");
      })
      .catch(() => toastError("Error al cargar cuentas"));
  }, [toastError]);

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId) ?? null;

  const fetchItems = useCallback(async () => {
    if (!selectedAccount) {
      setItems([]);
      return;
    }
    setLoading(true);
    setFetchError(null);
    try {
      const param = selectedAccount.channel === "TELEGRAM" ? "channelAccountId" : "waAccountId";
      const res = await fetch(`/api/whatsapp/canned-responses?${param}=${selectedAccount.id}`);
      const data = await res.json();
      if (Array.isArray(data)) setItems(data);
      else throw new Error(data.error ?? "Error al cargar respuestas rápidas");
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Error al cargar respuestas rápidas");
    } finally {
      setLoading(false);
    }
  }, [selectedAccount]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount/account-change; fetchItems also used for manual refresh
    fetchItems();
  }, [fetchItems]);

  async function handleDelete() {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/whatsapp/canned-responses/${deleteId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Error al eliminar");
      }
      success("Respuesta rápida eliminada");
      setItems((prev) => prev.filter((i) => i.id !== deleteId));
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Error al eliminar");
    } finally {
      setDeleteId(null);
    }
  }

  const columns: TableColumn<CannedResponse>[] = useMemo(() => [
    {
      key: "shortcut",
      header: "Atajo",
      render: (r) => <span className="font-mono text-sm text-accent-ink">/{r.shortcut}</span>,
    },
    {
      key: "content",
      header: "Contenido",
      render: (r) => <span className="text-sm text-muted-darker line-clamp-1">{r.content}</span>,
    },
  ], []);

  return (
    <Card as="section" className="space-y-4">
      <SectionHeader title="Respuestas rápidas" />
      <p className="text-sm text-muted">
        Atajos de texto (/atajo) que el equipo puede insertar al escribir en un chat.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        {accounts.length > 1 && (
          <div className="w-56">
            <Select
              aria-label="Cuenta"
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              placeholder="Seleccionar cuenta"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.channel === "TELEGRAM" ? "Telegram" : "WhatsApp"}
                </option>
              ))}
            </Select>
          </div>
        )}
        <Button
          size="sm"
          icon={Plus}
          onClick={() => { setEditing(null); setModalOpen(true); }}
          disabled={!selectedAccountId}
        >
          Nueva respuesta
        </Button>
      </div>

      {!selectedAccountId ? (
        <p className="py-2 text-sm text-muted">
          {accounts.length === 0
            ? "Conecta una cuenta de WhatsApp o Telegram para crear respuestas rápidas."
            : "Selecciona una cuenta para ver sus respuestas rápidas."}
        </p>
      ) : (
        <Table
          columns={columns}
          rows={items}
          rowKey={(r) => r.id}
          loading={loading}
          error={fetchError}
          onRetry={fetchItems}
          emptyIcon={MessageSquareDashed}
          emptyTitle="Sin respuestas rápidas"
          emptyDescription="Crea atajos como /gracias para responder más rápido en los chats."
          rowActions={(r) => (
            <>
              <DropdownItem icon={Pencil} onClick={() => { setEditing(r); setModalOpen(true); }}>
                Editar
              </DropdownItem>
              <DropdownItem icon={Trash2} onClick={() => setDeleteId(r.id)}>
                Eliminar
              </DropdownItem>
            </>
          )}
        />
      )}

      <CannedResponseFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        accountId={selectedAccountId}
        channel={selectedAccount?.channel ?? "WHATSAPP"}
        initialData={editing}
        onSaved={fetchItems}
      />

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Eliminar respuesta rápida"
        description="Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        tone="danger"
        onConfirm={handleDelete}
      />
    </Card>
  );
}
