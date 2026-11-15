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
import { StarterTemplates } from "@/app/components/ui/starter-templates";
import { AUTOMATION_TEMPLATES } from "@/lib/automations/templates";

// Plantillas que se ofrecen en el estado vacío (las demás siguen en el alta).
const STARTER_AUTOMATIONS = ["welcome_menu", "ai_triage", "post_appointment"];
import { CHANNEL_LABEL, type AutomationChannelName } from "./_shared";
import { channelAndAccount } from "@/lib/chats/display-name";

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
  const [templateId, setTemplateId] = useState<string | null>(null);

  // ?plantilla=ai_triage (enlaces desde Bots, el embudo o Contactos): abre el
  // alta con esa plantilla. Se lee de window para no envolver la página en Suspense.
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("plantilla");
    if (!wanted || !AUTOMATION_TEMPLATES.some((t) => t.id === wanted)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- abre el alta pedida por la URL al montar
    setTemplateId(wanted);
    setNewOpen(true);
  }, []);
  const openWithTemplate = (id: string | null) => { setTemplateId(id); setNewOpen(true); };
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
    try {
      const res = await fetch(`/api/automations/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "No se pudo actualizar");
      success(status === "ACTIVE" ? "Automatización activada" : "Pausada: no arrancan nuevas ejecuciones");
      await load();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "No se pudo actualizar");
    }
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
    <div className="space-y-5">
      <PageHeader
        title="Automatizaciones"
        actions={<Button icon={Plus} onClick={() => openWithTemplate(null)}>Nueva automatización</Button>}
      />

      <EntityList
        rows={rows}
        rowKey={(r) => r.id}
        loading={loading}
        error={fetchError}
        onRetry={load}
        emptyIcon={Workflow}
        emptyTitle="Tu primera automatización"
        emptyDescription="Responde, etiqueta y mueve leads sin hacerlo a mano. Elige una plantilla y ajústala en el editor:"
        emptyAction={
          <div className="space-y-3">
            <StarterTemplates
              cards={STARTER_AUTOMATIONS.map((id) => AUTOMATION_TEMPLATES.find((t) => t.id === id)!).map((t) => ({ id: t.id, title: t.name, description: t.description, onSelect: () => openWithTemplate(t.id) }))}
            />
            <p className="text-xs text-muted">Para contestar fuera de horario no hace falta un flujo: activa el mensaje fuera de horario en Configuración → IA y operación.</p>
            <Button variant="ghost" size="sm" icon={Plus} onClick={() => openWithTemplate("blank")}>O empezar en blanco</Button>
          </div>
        }
        rowHref={(r) => `/whatsapp/automatizaciones/${r.id}`}
        renderRow={(r) => (
          <EntityRow
            leading={<EntityAvatar id={r.account.id} name={r.account.name} />}
            title={r.name}
            subtitle={`${triggerSummary(r.trigger)} · ${channelAndAccount(CHANNEL_LABEL[r.account.channel], r.account.name)}`}
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

      <NewAutomationModal open={newOpen} onClose={() => setNewOpen(false)} initialTemplateId={templateId} />
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
