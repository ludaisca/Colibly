"use client";

import { Tooltip } from "@/app/components/ui/tooltip";
import { useState, useEffect, useCallback } from "react";
import { Plus, Workflow, Power, PowerOff, Trash2 } from "lucide-react";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Spinner } from "@/app/components/ui/spinner";
import { EntityList, EntityRow } from "@/app/components/ui/entity-list";
import { EntityAvatar } from "@/app/components/ui/avatar";
import { ConfirmDialog } from "@/app/components/ui/confirm-dialog";
import { PageHeader } from "@/app/components/ui/page-header";
import { useToast } from "@/app/components/ui/toast";
import { SequenceFormModal } from "./_form";

const TRIGGER_LABEL: Record<string, string> = {
  TAG_ADDED: "Etiqueta agregada",
  LEAD_STATUS_CHANGED: "Cambio de estado",
  APPOINTMENT_COMPLETED: "Cita completada",
};

interface Sequence {
  id: string;
  waAccountId: string | null;
  channelAccountId: string | null;
  name: string;
  active: boolean;
  triggerType: string;
  triggerValue: string | null;
  waAccount: { id: string; name: string } | null;
  channelAccount: { id: string; name: string } | null;
  steps: Array<{ id: string; order: number; delayMinutes: number; message: string }>;
  _count: { enrollments: number };
  // Inscripciones FAILED (envío fallido) o EXPIRED (fuera de la ventana de 24h).
  stoppedEnrollments: number;
}

export default function SequencesPage() {
  const { success, error: toastError } = useToast();
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const fetchSequences = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/whatsapp/sequences");
      const data = await res.json();
      if (!res.ok || !Array.isArray(data)) throw new Error(data.error ?? "Error al cargar secuencias");
      setSequences(data);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Error al cargar secuencias");
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; fetchSequences also used for manual refresh
  useEffect(() => { fetchSequences(); }, [fetchSequences]);

  async function handleDelete() {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/whatsapp/sequences/${deleteId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Error al eliminar");
      success("Secuencia eliminada");
      setSequences((prev) => prev.filter((s) => s.id !== deleteId));
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Error al eliminar");
    } finally {
      setDeleteId(null);
    }
  }

  async function handleToggle(seq: Sequence) {
    setTogglingId(seq.id);
    try {
      const res = await fetch(`/api/whatsapp/sequences/${seq.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !seq.active }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSequences((prev) => prev.map((s) => (s.id === seq.id ? { ...s, active: data.active } : s)));
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Error al cambiar estado");
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Secuencias"
        description="Un evento inscribe al contacto y envía mensajes programados en orden. Disponible para WhatsApp y Telegram."
        actions={
          <Button icon={Plus} size="sm" onClick={() => { setEditId(null); setFormOpen(true); }}>
            Crear secuencia
          </Button>
        }
      />

      <EntityList
        rows={sequences}
        rowKey={(seq) => seq.id}
        loading={loading}
        error={fetchError}
        onRetry={fetchSequences}
        emptyIcon={Workflow}
        emptyTitle="Sin secuencias"
        emptyDescription="Crea tu primera secuencia para dar seguimiento tras una etiqueta, un cambio de estado o una cita completada."
        onRowClick={(seq) => { setEditId(seq.id); setFormOpen(true); }}
        renderRow={(seq) => (
          <>
            <EntityRow
              leading={<EntityAvatar id={seq.waAccountId ?? seq.channelAccountId ?? seq.id} name={seq.name} size="sm" />}
              title={seq.name}
              badges={
                <span className="flex shrink-0 items-center gap-1">
                  <Badge tone="info" size="sm">{TRIGGER_LABEL[seq.triggerType] ?? seq.triggerType}</Badge>
                  <Badge tone={seq.active ? "success" : "neutral"} size="sm">
                    {seq.active ? "Activa" : "Pausada"}
                  </Badge>
                  {seq.stoppedEnrollments > 0 && (
                    <Badge tone="warning" size="sm">
                      {seq.stoppedEnrollments} sin completar
                    </Badge>
                  )}
                </span>
              }
              subtitle={
                <>
                  {seq.waAccount?.name ?? seq.channelAccount?.name ?? "Sin cuenta"} · {seq.steps.length} paso{seq.steps.length !== 1 ? "s" : ""} · {seq._count.enrollments} inscrito{seq._count.enrollments !== 1 ? "s" : ""}
                </>
              }
              meta={<span className="tabular-nums">{seq._count.enrollments}</span>}
            />
            <span className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <Tooltip label={seq.active ? "Pausar" : "Activar"}><button aria-label={seq.active ? "Pausar" : "Activar"}
                onClick={() => handleToggle(seq)}
                disabled={togglingId === seq.id}
                className={`p-1.5 rounded-md transition-colors ${
                  seq.active
                    ? "bg-success-bg text-success hover:bg-success-bg/80"
                    : "bg-surface-light text-muted-darker hover:text-foreground"
                }`}
              >
                {togglingId === seq.id ? <Spinner size="sm" /> : seq.active ? <Power size={14} /> : <PowerOff size={14} />}
              </button></Tooltip>
              <Button
                variant="ghost"
                size="sm"
                icon={Trash2}
                onClick={() => setDeleteId(seq.id)}
                className="text-muted-darker hover:text-danger"
                title="Eliminar"
              />
            </span>
          </>
        )}
      />

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Eliminar secuencia"
        description="Esta acción eliminará permanentemente la secuencia y todas sus inscripciones. No se puede deshacer."
        confirmLabel="Eliminar"
        tone="danger"
        onConfirm={handleDelete}
      />

      <SequenceFormModal
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditId(null); }}
        editId={editId}
        onSaved={fetchSequences}
      />
    </div>
  );
}
