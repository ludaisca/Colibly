"use client";

import { useMemo, useState } from "react";
import { Contact as ContactIcon, Pencil, Trash2 } from "lucide-react";
import { displayName } from "@/lib/chats/display-name";
import { formatPhoneShort } from "@/lib/format/phone";
import { plural } from "@/lib/format/plural";
import { tagDotClass } from "@/lib/tags-shared";
import { Table, type TableColumn } from "@/app/components/ui/table";
import { Checkbox } from "@/app/components/ui/checkbox";
import { EntityAvatar } from "@/app/components/ui/avatar";
import { RelativeTime } from "@/app/components/ui/relative-time";
import { Button } from "@/app/components/ui/button";
import { DropdownItem } from "@/app/components/ui/dropdown";
import { ConfirmDialog } from "@/app/components/ui/confirm-dialog";
import { Modal } from "@/app/components/ui/modal";
import { FormField } from "@/app/components/ui/form-field";
import { Input } from "@/app/components/ui/input";
import { Select } from "@/app/components/ui/select";
import { useToast } from "@/app/components/ui/toast";
import { cn } from "@/app/components/ui/cn";
import { LEAD_STATUS_LABEL } from "@/app/components/ui/lead-status";

export interface ContactTableRow {
  id: string;
  accountId: string | null;
  isSample?: boolean;
  remoteJid: string;
  name: string | null;
  leadStatus: string;
  updatedAt: string;
  tags: Array<{ tag: { id: string; name: string; color: string } }>;
  chat: { id: string; unreadCount: number; lastMessageAt: string | null; assignedTo?: { id: string; name: string | null } | null } | null;
  pipelineStage?: { name: string } | null;
  channel: "WHATSAPP" | "TELEGRAM" | "MESSENGER" | "INSTAGRAM" | "WEBCHAT" | null;
}

const CHANNEL_LABEL = { TELEGRAM: "Telegram", MESSENGER: "Messenger", INSTAGRAM: "Instagram", WEBCHAT: "Chat web" } as const;

function phoneOrChannel(row: ContactTableRow): string {
  if (row.channel && row.channel !== "WHATSAPP") return CHANNEL_LABEL[row.channel];
  return formatPhoneShort(row.remoteJid) ?? row.remoteJid.split("@")[0];
}

// Tabla de Contactos (dirección congelada + QA-018): selección con barra de
// acciones (Etiquetar, Asignar, Eliminar), menú ⋯ por fila con Editar y
// Eliminar. Las acciones en lote llaman a las mismas APIs que la ficha.
export function ContactsTable({
  rows,
  loading,
  error,
  onRetry,
  onOpen,
  onChanged,
  canDelete,
  empty,
}: {
  rows: ContactTableRow[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onOpen: (id: string) => void;
  onChanged: () => void;
  /** Eliminar es solo para admin (la API responde 403 a los demás). */
  canDelete: boolean;
  empty: { title: string; description: string; action?: React.ReactNode };
}) {
  const { success, error: toastError } = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ContactTableRow[] | null>(null);
  const [tagOpen, setTagOpen] = useState(false);
  const [tagName, setTagName] = useState("");
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignees, setAssignees] = useState<Array<{ id: string; name: string | null }>>([]);
  const [assigneeId, setAssigneeId] = useState("");

  // La selección vive por página: al cambiar de página o filtro se limpia sola.
  const visibleIds = useMemo(() => new Set(rows.map((r) => r.id)), [rows]);
  const selectedRows = rows.filter((r) => selected.has(r.id));
  const allSelected = rows.length > 0 && selectedRows.length === rows.length;
  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set([...prev].filter((x) => visibleIds.has(x)));
      if (on) next.add(id); else next.delete(id);
      return next;
    });

  async function runEach(targets: ContactTableRow[], fn: (row: ContactTableRow) => Promise<Response | null>, done: string) {
    setBusy(true);
    let failed = 0;
    for (const row of targets) {
      const res = await fn(row).catch(() => null);
      if (res && !res.ok) failed++;
    }
    setBusy(false);
    setSelected(new Set());
    onChanged();
    if (failed > 0) toastError(`No se pudo con ${plural(failed, "contacto")}`);
    else success(done);
  }

  async function deleteRows(targets: ContactTableRow[]) {
    await runEach(targets, (row) => fetch(`/api/whatsapp/contacts/${row.id}`, { method: "DELETE" }), targets.length === 1 ? "Contacto eliminado" : `${plural(targets.length, "contacto eliminado", "contactos eliminados")}`);
    setConfirmDelete(null);
  }

  async function openAssign() {
    const first = selectedRows.find((r) => r.chat) ?? selectedRows[0];
    if (!first) return;
    try {
      const res = await fetch(`/api/whatsapp/contacts/${first.id}/assignees`);
      const data = await res.json();
      setAssignees(Array.isArray(data) ? data : []);
    } catch {
      setAssignees([]);
    }
    setAssigneeId("");
    setAssignOpen(true);
  }

  const columns: TableColumn<ContactTableRow>[] = [
    {
      key: "select",
      header: (
        <Checkbox ariaLabel="Seleccionar todos los contactos de esta página" checked={allSelected} onChange={(on) => setSelected(on ? new Set(rows.map((r) => r.id)) : new Set())} />
      ),
      headerClassName: "w-10",
      render: (row) => (
        <span onClick={(e) => e.stopPropagation()}>
          <Checkbox ariaLabel={`Seleccionar ${displayName(row.name, row.remoteJid)}`} checked={selected.has(row.id)} onChange={(on) => toggle(row.id, on)} />
        </span>
      ),
    },
    {
      key: "name",
      header: "Nombre",
      render: (row) => {
        const name = displayName(row.name, row.remoteJid);
        return (
          <span className="flex min-w-0 items-center gap-2">
            <EntityAvatar id={row.accountId ?? row.id} name={name} size="xs" className="h-6 w-6" />
            <span className="truncate font-medium text-foreground">{name}</span>
            {row.isSample && <span className="shrink-0 rounded-xs bg-info-bg px-1 text-xs text-info">Ejemplo</span>}
          </span>
        );
      },
    },
    { key: "phone", header: "Teléfono", hideBelow: "md", render: (row) => <span className="tabular-nums text-muted">{phoneOrChannel(row)}</span> },
    {
      key: "tags",
      header: "Etiquetas",
      hideBelow: "lg",
      render: (row) => (
        <span className="flex min-w-0 items-center gap-2.5 text-muted">
          {row.tags.slice(0, 2).map(({ tag }) => (
            <span key={tag.id} className="inline-flex min-w-0 items-center gap-1.5">
              <span aria-hidden className={cn("h-[7px] w-[7px] shrink-0 rounded-full", tagDotClass(tag.color))} />
              <span className="truncate">{tag.name}</span>
            </span>
          ))}
          {row.tags.length > 2 && <span className="tabular-nums text-muted-darker">+{row.tags.length - 2}</span>}
        </span>
      ),
    },
    { key: "stage", header: "Etapa", render: (row) => <span className="text-muted">{row.pipelineStage?.name ?? LEAD_STATUS_LABEL[row.leadStatus as keyof typeof LEAD_STATUS_LABEL] ?? row.leadStatus}</span> },
    { key: "assignee", header: "Asignado a", hideBelow: "lg", render: (row) => <span className="text-muted">{row.chat?.assignedTo?.name ?? "—"}</span> },
    {
      key: "activity",
      header: "Última actividad",
      hideBelow: "md",
      headerClassName: "text-right",
      cellClassName: "text-right text-muted",
      render: (row) => <RelativeTime value={row.chat?.lastMessageAt ?? row.updatedAt} />,
    },
  ];

  return (
    <div className="space-y-2">
      {selectedRows.length > 0 && (
        <div role="toolbar" aria-label="Acciones de la selección" className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
          <span className="text-sm font-medium tabular-nums">{plural(selectedRows.length, "seleccionado", "seleccionados")}</span>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => { setTagName(""); setTagOpen(true); }}>Etiquetar</Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void openAssign()}>Asignar</Button>
          {canDelete && <Button size="sm" variant="secondary" disabled={busy} onClick={() => setConfirmDelete(selectedRows)}>Eliminar</Button>}
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelected(new Set())}>Quitar selección</Button>
        </div>
      )}

      <Table
        className="overflow-hidden rounded-lg border border-border bg-surface px-4"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        loading={loading}
        error={error ?? undefined}
        onRetry={onRetry}
        onRowClick={(row) => onOpen(row.id)}
        emptyIcon={ContactIcon}
        emptyTitle={empty.title}
        emptyDescription={empty.description}
        emptyAction={empty.action}
        rowActions={(row) => (
          <>
            <DropdownItem icon={Pencil} onClick={() => onOpen(row.id)}>Editar</DropdownItem>
            {canDelete && <DropdownItem icon={Trash2} danger onClick={() => setConfirmDelete([row])}>Eliminar</DropdownItem>}
          </>
        )}
        mobileCard={(row) => (
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{displayName(row.name, row.remoteJid)}</p>
            <p className="truncate text-xs text-muted">{phoneOrChannel(row)} · {row.pipelineStage?.name ?? LEAD_STATUS_LABEL[row.leadStatus as keyof typeof LEAD_STATUS_LABEL] ?? row.leadStatus}</p>
          </div>
        )}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        loading={busy}
        title={confirmDelete && confirmDelete.length === 1
          ? `¿Eliminar "${displayName(confirmDelete[0].name, confirmDelete[0].remoteJid)}"?`
          : `¿Eliminar ${plural(confirmDelete?.length ?? 0, "contacto")}?`}
        description="Se borran sus chats y mensajes. No se puede deshacer."
        confirmLabel="Eliminar"
        onConfirm={() => deleteRows(confirmDelete ?? [])}
      />

      <Modal
        open={tagOpen}
        onClose={() => setTagOpen(false)}
        title="Etiquetar contactos"
        description={`La etiqueta se agrega a ${plural(selectedRows.length, "contacto")}; si no existe en su cuenta, se crea.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setTagOpen(false)}>Cancelar</Button>
            <Button
              disabled={busy || !tagName.trim()}
              onClick={async () => {
                const name = tagName.trim();
                setTagOpen(false);
                await runEach(selectedRows, (row) => fetch(`/api/whatsapp/contacts/${row.id}/tags`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }), "Etiqueta agregada");
              }}
            >
              Etiquetar
            </Button>
          </>
        }
      >
        <FormField label="Etiqueta" required>
          {(id) => <Input id={id} value={tagName} maxLength={50} onChange={(e) => setTagName(e.target.value)} placeholder="VIP" autoFocus />}
        </FormField>
      </Modal>

      <Modal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title="Asignar contactos"
        description="Se asigna el chat de cada contacto. Los contactos sin conversación se omiten."
        footer={
          <>
            <Button variant="secondary" onClick={() => setAssignOpen(false)}>Cancelar</Button>
            <Button
              disabled={busy || !assigneeId}
              onClick={async () => {
                setAssignOpen(false);
                const targets = selectedRows.filter((row) => row.chat);
                await runEach(targets, (row) => fetch(`/api/whatsapp/chats/${row.chat!.id}/assign`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assignedToId: assigneeId === "none" ? null : assigneeId }) }), "Asignación actualizada");
              }}
            >
              Asignar
            </Button>
          </>
        }
      >
        <FormField label="Asignado a" required>
          {(id) => (
            <Select id={id} value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} placeholder="Elige a una persona">
              <option value="none">Sin asignar</option>
              {assignees.map((a) => <option key={a.id} value={a.id}>{a.name ?? "Sin nombre"}</option>)}
            </Select>
          )}
        </FormField>
      </Modal>
    </div>
  );
}
