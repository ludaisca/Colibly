"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { ListPlus, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Card } from "@/app/components/ui/card";
import { ConfirmDialog } from "@/app/components/ui/confirm-dialog";
import { DropdownItem } from "@/app/components/ui/dropdown";
import { SectionHeader } from "@/app/components/ui/section-header";
import { Select } from "@/app/components/ui/select";
import { Table, type TableColumn } from "@/app/components/ui/table";
import { useToast } from "@/app/components/ui/toast";
import { ChatAttributeFormModal, type ChatAttribute } from "./_atributos-conversacion-form";

interface Account {
  id: string;
  name: string;
  channel: string;
}

const CHANNEL_LABEL: Record<string, string> = {
  WHATSAPP: "WhatsApp",
  TELEGRAM: "Telegram",
  MESSENGER: "Messenger",
  INSTAGRAM: "Instagram",
  WEBCHAT: "Chat web",
};

const TYPE_LABEL: Record<ChatAttribute["type"], string> = {
  TEXT: "Texto",
  NUMBER: "Número",
  DATE: "Fecha",
  BOOLEAN: "Sí/No",
  SELECT: "Lista",
};

export function AtributosConversacionSection() {
  const { data: session } = useSession();
  const { success, error: toastError } = useToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [items, setItems] = useState<ChatAttribute[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ChatAttribute | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (session?.user?.role === "ejecutivo") return;
    const endpoints = ["whatsapp", "telegram", "messenger", "instagram", "webchat"];
    const channels = ["WHATSAPP", "TELEGRAM", "MESSENGER", "INSTAGRAM", "WEBCHAT"];
    Promise.all(endpoints.map(async (endpoint) => {
      const res = await fetch(`/api/${endpoint}/accounts`);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    }))
      .then((results) => {
        const merged = results.flatMap((rows, index) => rows.map((account: { id: string; name: string }) => ({
          id: account.id,
          name: account.name,
          channel: channels[index],
        })));
        setAccounts(merged);
        setSelectedAccountId((current) => current || merged[0]?.id || "");
      })
      .catch(() => toastError("Error al cargar cuentas"));
  }, [session?.user?.role, toastError]);

  const selectedAccount = accounts.find((account) => account.id === selectedAccountId) ?? null;
  const isWhatsApp = selectedAccount?.channel === "WHATSAPP";

  const load = useCallback(async () => {
    if (!selectedAccount) {
      setItems([]);
      return;
    }
    setLoading(true);
    setFetchError(null);
    try {
      const param = selectedAccount.channel === "WHATSAPP" ? "waAccountId" : "channelAccountId";
      const res = await fetch(`/api/whatsapp/chat-custom-fields?${param}=${selectedAccount.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al cargar atributos");
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Error al cargar atributos");
    } finally {
      setLoading(false);
    }
  }, [selectedAccount]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-account-change
    void load();
  }, [load]);

  async function remove() {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/whatsapp/chat-custom-fields/${deleteId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Error al eliminar");
      success("Atributo eliminado");
      setDeleteId(null);
      await load();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Error al eliminar");
    }
  }

  const columns: TableColumn<ChatAttribute>[] = useMemo(() => [
    {
      key: "label",
      header: "Atributo",
      render: (row) => (
        <div>
          <span className="text-sm font-medium text-foreground">{row.label}</span>
          <span className="block font-mono text-xs text-muted-darker">{row.key}</span>
        </div>
      ),
    },
    {
      key: "type",
      header: "Tipo",
      render: (row) => (
        <span className="flex items-center gap-1.5">
          <Badge tone="neutral" size="sm">{TYPE_LABEL[row.type]}</Badge>
          {row.required && <Badge tone="warning" size="sm">Obligatorio</Badge>}
        </span>
      ),
    },
  ], []);

  if (session?.user?.role === "ejecutivo") return null;

  return (
    <Card as="section" className="space-y-4">
      <SectionHeader title="Atributos de conversación" />
      <p className="text-sm text-muted">
        Campos por chat para clasificar el motivo, la objeción o el contexto de la conversación. No se comparten con la ficha del contacto.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        {accounts.length > 1 && (
          <div className="w-60">
            <Select aria-label="Cuenta" value={selectedAccountId} onChange={(event) => setSelectedAccountId(event.target.value)}>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} · {CHANNEL_LABEL[account.channel] ?? account.channel}
                </option>
              ))}
            </Select>
          </div>
        )}
        <Button size="sm" icon={Plus} onClick={() => { setEditing(null); setModalOpen(true); }} disabled={!selectedAccountId}>
          Nuevo atributo
        </Button>
      </div>

      {!selectedAccountId ? (
        <p className="py-2 text-sm text-muted">
          {accounts.length === 0 ? "Conecta una cuenta para crear atributos." : "Selecciona una cuenta para ver sus atributos."}
        </p>
      ) : (
        <Table
          columns={columns}
          rows={items}
          rowKey={(row) => row.id}
          loading={loading}
          error={fetchError}
          onRetry={load}
          emptyIcon={ListPlus}
          emptyTitle="Sin atributos de conversación"
          emptyDescription="Crea campos como «Motivo de contacto» u «Objeción principal»."
          rowActions={(row) => (
            <>
              <DropdownItem icon={Pencil} onClick={() => { setEditing(row); setModalOpen(true); }}>Editar</DropdownItem>
              <DropdownItem icon={Trash2} danger onClick={() => setDeleteId(row.id)}>Eliminar</DropdownItem>
            </>
          )}
        />
      )}

      <ChatAttributeFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        accountId={selectedAccountId}
        isWhatsApp={isWhatsApp}
        initialData={editing}
        onSaved={load}
      />

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Eliminar atributo"
        description="Las definiciones se pueden borrar; los valores ya guardados en los chats dejan de mostrarse."
        confirmLabel="Eliminar"
        tone="danger"
        onConfirm={remove}
      />
    </Card>
  );
}
