"use client";

import { NeedsChannelEmpty } from "@/app/components/ui/needs-channel";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, ListPlus, Trash2, Pencil } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Select } from "@/app/components/ui/select";
import { Badge } from "@/app/components/ui/badge";
import { ConfirmDialog } from "@/app/components/ui/confirm-dialog";
import { DropdownItem } from "@/app/components/ui/dropdown";
import { Table, type TableColumn } from "@/app/components/ui/table";
import { SettingsBlock } from "@/app/components/ui/settings-block";
import { useToast } from "@/app/components/ui/toast";
import { CustomFieldFormModal } from "./_campos-personalizados-form";
import { useRunOnChange } from "@/app/components/ui/use-run-on-change";

// Mismo patrón que RespuestasRapidasSection: sección embebida en
// /configuracion, selector de cuenta + tabla + modal de create/edit. Las
// definiciones son "por cuenta" (como CannedResponse) porque distintos
// números/canales pueden servir a verticales de negocio distintas.

interface Account { id: string; name: string; channel: "WHATSAPP" | "TELEGRAM"; }

interface CustomFieldDefinition {
  id: string;
  key: string;
  label: string;
  type: "TEXT" | "NUMBER" | "DATE" | "BOOLEAN" | "SELECT";
  options: string[];
  required: boolean;
}

const TYPE_LABEL: Record<CustomFieldDefinition["type"], string> = {
  TEXT: "Texto",
  NUMBER: "Número",
  DATE: "Fecha",
  BOOLEAN: "Sí/No",
  SELECT: "Lista",
};

export function CamposPersonalizadosSection() {
  const { success, error: toastError } = useToast();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [items, setItems] = useState<CustomFieldDefinition[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CustomFieldDefinition | null>(null);
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
      .catch(() => toastError("Error al cargar cuentas"))
      .finally(() => setAccountsLoaded(true));
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
      const res = await fetch(`/api/whatsapp/custom-fields?${param}=${selectedAccount.id}`);
      const data = await res.json();
      if (Array.isArray(data)) setItems(data);
      else throw new Error(data.error ?? "Error al cargar campos personalizados");
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Error al cargar campos personalizados");
    } finally {
      setLoading(false);
    }
  }, [selectedAccount]);

  useRunOnChange(() => fetchItems(), [fetchItems]);

  async function handleDelete() {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/whatsapp/custom-fields/${deleteId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Error al eliminar");
      }
      success("Campo eliminado");
      setItems((prev) => prev.filter((i) => i.id !== deleteId));
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Error al eliminar");
    } finally {
      setDeleteId(null);
    }
  }

  const columns: TableColumn<CustomFieldDefinition>[] = useMemo(() => [
    {
      key: "label",
      header: "Campo",
      render: (r) => (
        <div>
          <span className="text-sm text-foreground font-medium">{r.label}</span>
          <span className="block text-xs text-muted-darker tabular-nums">{r.key}</span>
        </div>
      ),
    },
    {
      key: "type",
      header: "Tipo",
      render: (r) => (
        <span className="flex items-center gap-1.5">
          <Badge tone="neutral" size="sm">{TYPE_LABEL[r.type]}</Badge>
          {r.required && <Badge tone="warning" size="sm">Obligatorio</Badge>}
        </span>
      ),
    },
  ], []);

  return (
    <SettingsBlock title="Campos personalizados" description="Datos extra en la ficha de cada contacto.">
      <p className="text-sm text-muted">
        Campos adicionales que se agregan a la ficha de cada contacto (útil para verticales como spas, clínicas o escuelas).
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
        {/* Sin cuenta no hay botón deshabilitado: solo "Conectar WhatsApp". */}
        {selectedAccountId && (
          <Button size="sm" variant="secondary" icon={Plus} onClick={() => { setEditing(null); setModalOpen(true); }}>
            Nuevo campo
          </Button>
        )}
      </div>

      {accountsLoaded && accounts.length === 0 ? (
        <NeedsChannelEmpty description="Los campos personalizados se guardan por número de WhatsApp. Conecta tu número y créalos en un minuto." />
      ) : !selectedAccountId ? (
        <p className="py-2 text-sm text-muted">{accountsLoaded ? "Selecciona una cuenta para ver sus campos personalizados." : "Cargando cuentas…"}</p>
      ) : (
        <Table
          columns={columns}
          rows={items}
          rowKey={(r) => r.id}
          loading={loading}
          error={fetchError}
          onRetry={fetchItems}
          emptyIcon={ListPlus}
          emptyTitle="Sin campos personalizados"
          emptyDescription="Crea campos como «Fecha de nacimiento» o «Talla preferida» para esta cuenta."
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

      <CustomFieldFormModal
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
        title="Eliminar campo personalizado"
        description="Esta acción no se puede deshacer y borra los valores ya guardados en los contactos."
        confirmLabel="Eliminar"
        tone="danger"
        onConfirm={handleDelete}
      />
    </SettingsBlock>
  );
}
