"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2, Zap } from "lucide-react";
import { Banner } from "@/app/components/ui/banner";
import { Button } from "@/app/components/ui/button";
import { Card } from "@/app/components/ui/card";
import { ConfirmDialog } from "@/app/components/ui/confirm-dialog";
import { DropdownItem } from "@/app/components/ui/dropdown";
import { Input } from "@/app/components/ui/input";
import { Modal } from "@/app/components/ui/modal";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionHeader } from "@/app/components/ui/section-header";
import { Table, type TableColumn } from "@/app/components/ui/table";
import { Textarea } from "@/app/components/ui/textarea";
import { useToast } from "@/app/components/ui/toast";
import { macroActionsSummary, type MacroAction } from "@/lib/macros/types";
import { Checkbox } from "@/app/components/ui/checkbox";
import { BackLink } from "@/app/components/ui/back-link";

interface MacroRow {
  id: string;
  name: string;
  description: string | null;
  actions: MacroAction[];
  updatedAt: string;
}

export function MacrosView() {
  const { success, error: toastError } = useToast();
  const [macros, setMacros] = useState<MacroRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MacroRow | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [assignSelf, setAssignSelf] = useState(false);
  const [resolve, setResolve] = useState(false);
  const [priorityHigh, setPriorityHigh] = useState(false);
  const [snooze, setSnooze] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/whatsapp/macros");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al cargar macros");
      setMacros(Array.isArray(data) ? data : []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Error al cargar macros");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setName("");
    setDescription("");
    setAssignSelf(false);
    setResolve(false);
    setPriorityHigh(false);
    setSnooze(false);
    setMessage("");
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(macro: MacroRow) {
    setEditing(macro);
    setName(macro.name);
    setDescription(macro.description ?? "");
    setAssignSelf(macro.actions.some((a) => a.type === "assign_self"));
    setResolve(macro.actions.some((a) => a.type === "status" && a.status === "RESOLVED"));
    setPriorityHigh(macro.actions.some((a) => a.type === "priority" && a.priority === "HIGH"));
    setSnooze(macro.actions.some((a) => a.type === "snooze"));
    setMessage(macro.actions.find((a) => a.type === "send_message")?.body ?? "");
    setFormError(null);
    setModalOpen(true);
  }

  async function save() {
    const actions: MacroAction[] = [];
    if (assignSelf) actions.push({ type: "assign_self" });
    if (resolve) actions.push({ type: "status", status: "RESOLVED" });
    if (priorityHigh) actions.push({ type: "priority", priority: "HIGH" });
    if (snooze) actions.push({ type: "snooze", preset: "1h" });
    if (message.trim()) actions.push({ type: "send_message", body: message.trim() });

    if (!name.trim()) { setFormError("La macro necesita un nombre"); return; }
    if (actions.length === 0) { setFormError("Selecciona al menos una acción"); return; }

    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch(editing ? `/api/whatsapp/macros/${editing.id}` : "/api/whatsapp/macros", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || null, actions }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar");
      success(editing ? "Macro actualizada" : "Macro creada");
      setModalOpen(false);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/whatsapp/macros/${deleteId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "No se pudo eliminar");
      }
      success("Macro eliminada");
      setDeleteId(null);
      await load();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "No se pudo eliminar");
    } finally {
      setDeleting(false);
    }
  }

  const columns: TableColumn<MacroRow>[] = useMemo(() => [
    {
      key: "name",
      header: "Macro",
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{row.name}</p>
          {row.description && <p className="truncate text-xs text-muted">{row.description}</p>}
        </div>
      ),
    },
    {
      key: "actions",
      header: "Acciones",
      render: (row) => <span className="text-xs text-muted">{macroActionsSummary(row.actions)}</span>,
      hideBelow: "sm",
    },
  ], []);

  return (
    <div className="space-y-5">
      <BackLink href="/configuracion" className="-mb-2">Volver a configuración</BackLink>
      <PageHeader
        title="Macros"
        actions={
          <>
            <Button icon={Plus} onClick={openCreate}>Nueva macro</Button>
          </>
        }
      />

      <Card className="p-4">
        <SectionHeader title="Macros de la organización" />
        <p className="mt-1 text-sm text-muted">
          Se ejecutan desde el menú del chat. No son automatizaciones: cada aplicación la decide un agente.
        </p>
        <Table
          className="mt-4"
          columns={columns}
          rows={macros}
          rowKey={(row) => row.id}
          loading={loading}
          error={loadError}
          onRetry={load}
          emptyIcon={Zap}
          emptyTitle="Sin macros"
          emptyDescription="Crea una macro con las acciones que más repites."
          rowActions={(row) => (
            <>
              <DropdownItem icon={Pencil} onClick={() => openEdit(row)}>Editar</DropdownItem>
              <DropdownItem icon={Trash2} danger onClick={() => setDeleteId(row.id)}>Eliminar</DropdownItem>
            </>
          )}
        />
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Editar macro" : "Nueva macro"}
        description="Elige las acciones que se aplicarán en orden al chat."
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={() => void save()} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && <Banner tone="danger">{formError}</Banner>}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-darker" htmlFor="macro-name">Nombre</label>
            <Input id="macro-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej. Tomar y resolver" maxLength={80} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-darker" htmlFor="macro-description">Descripción (opcional)</label>
            <Input id="macro-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={300} />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-darker">Acciones</p>
            {[
              { checked: assignSelf, set: setAssignSelf, label: "Asignarme el chat" },
              { checked: resolve, set: setResolve, label: "Resolver el chat" },
              { checked: priorityHigh, set: setPriorityHigh, label: "Marcar prioridad alta" },
              { checked: snooze, set: setSnooze, label: "Posponer 1 hora" },
            ].map((item) => (
              <Checkbox key={item.label} checked={item.checked} onChange={item.set} label={item.label} />
            ))}
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-darker" htmlFor="macro-message">Mensaje (opcional)</label>
            <Textarea id="macro-message" value={message} onChange={(event) => setMessage(event.target.value)} rows={3} maxLength={2000} placeholder="Texto que se enviará al cliente" />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        loading={deleting}
        title="Eliminar macro"
        description="Los agentes dejarán de verla en el chat."
        confirmLabel="Eliminar"
        tone="danger"
        onConfirm={remove}
      />
    </div>
  );
}
