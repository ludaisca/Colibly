"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Workflow, Pause, Play, History, Trash2, Pencil } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
import { PageHeader } from "@/app/components/ui/page-header";
import { EntityList, EntityRow } from "@/app/components/ui/entity-list";
import { EntityAvatar } from "@/app/components/ui/avatar";
import { DropdownItem } from "@/app/components/ui/dropdown";
import { ConfirmDialog } from "@/app/components/ui/confirm-dialog";
import { useToast } from "@/app/components/ui/toast";
import { triggerSummary } from "@/lib/automations/labels";
import type { Trigger } from "@/lib/automations/types";
import { NewAutomationModal } from "./_new-modal";
import { CHANNEL_LABEL, type AutomationChannelName } from "./_shared";

interface AutomationRow {
  id: string;
  name: string;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";
  trigger: Trigger;
  account: { id: string; name: string; channel: AutomationChannelName };
  publishedVersion: { version: number } | null;
  runs: { live: number; completed: number; problems: number };
}

const STATUS: Record<AutomationRow["status"], { label: string; tone: "success" | "neutral" | "warning" }> = {
  ACTIVE: { label: "Activa", tone: "success" },
  DRAFT: { label: "Borrador", tone: "neutral" },
  PAUSED: { label: "Pausada", tone: "warning" },
  ARCHIVED: { label: "Archivada", tone: "neutral" },
};

export default function AutomationsPage() {
  const router = useRouter();
  const { success, error: toastError } = useToast();
  const [rows, setRows] = useState<AutomationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [deleting, setDeleting] = useState<AutomationRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/automations");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al cargar");
      setRows(data);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; load también refresca tras cada acción
    load();
  }, [load]);

  async function setStatus(row: AutomationRow, status: "ACTIVE" | "PAUSED") {
    const res = await fetch(`/api/automations/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toastError(data.error ?? "No se pudo actualizar");
    success(status === "ACTIVE" ? "Automatización activada" : "Pausada: no arrancan nuevas ejecuciones");
    load();
  }

  async function handleDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/automations/${deleting.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "No se pudo eliminar");
      success("Automatización eliminada");
      setDeleting(null);
      load();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "No se pudo eliminar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Automatizaciones"
        description="Chatbots con botones, respuestas por palabra clave, seguimientos y reglas — en todos tus canales."
        actions={<Button icon={Plus} onClick={() => setNewOpen(true)}>Nueva automatización</Button>}
      />

      <EntityList
        rows={rows}
        rowKey={(r) => r.id}
        loading={loading}
        error={fetchError}
        onRetry={load}
        emptyIcon={Workflow}
        emptyTitle="Sin automatizaciones"
        emptyDescription="Empieza con un menú de bienvenida, una clasificación con IA o un seguimiento post-cita."
        emptyAction={<Button icon={Plus} onClick={() => setNewOpen(true)}>Nueva automatización</Button>}
        onRowClick={(r) => router.push(`/whatsapp/automatizaciones/${r.id}`)}
        renderRow={(r) => (
          <EntityRow
            leading={<EntityAvatar id={r.account.id} name={r.account.name} />}
            title={r.name}
            subtitle={`${triggerSummary(r.trigger)} · ${r.account.name} (${CHANNEL_LABEL[r.account.channel]})`}
            badges={
              <>
                <Badge size="sm" tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                {r.publishedVersion && <Badge size="sm">v{r.publishedVersion.version}</Badge>}
                {r.runs.problems > 0 && <Badge size="sm" tone="danger">{r.runs.problems} con problemas</Badge>}
              </>
            }
            meta={`${r.runs.live} en curso · ${r.runs.completed} terminadas`}
          />
        )}
        rowActions={(r) => (
          <>
            <DropdownItem icon={Pencil} onClick={() => router.push(`/whatsapp/automatizaciones/${r.id}`)}>Editar</DropdownItem>
            <DropdownItem icon={History} onClick={() => router.push(`/whatsapp/automatizaciones/${r.id}/ejecuciones`)}>Ejecuciones</DropdownItem>
            {r.status === "ACTIVE" && <DropdownItem icon={Pause} onClick={() => setStatus(r, "PAUSED")}>Pausar</DropdownItem>}
            {r.status === "PAUSED" && <DropdownItem icon={Play} onClick={() => setStatus(r, "ACTIVE")}>Activar</DropdownItem>}
            <DropdownItem icon={Trash2} danger onClick={() => setDeleting(r)}>Eliminar</DropdownItem>
          </>
        )}
      />

      <NewAutomationModal open={newOpen} onClose={() => setNewOpen(false)} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        loading={busy}
        title={`¿Eliminar “${deleting?.name}”?`}
        description="Se borra junto con su historial de ejecuciones. Las que estén en curso se detienen."
        confirmLabel="Eliminar"
      />
    </div>
  );
}
