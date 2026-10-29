"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FlaskConical, History, Rocket, Save, Pencil, GitBranch, List } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
import { Banner } from "@/app/components/ui/banner";
import { Spinner } from "@/app/components/ui/spinner";
import { Drawer } from "@/app/components/ui/drawer";
import { ConfirmDialog } from "@/app/components/ui/confirm-dialog";
import { Input } from "@/app/components/ui/input";
import { useToast } from "@/app/components/ui/toast";
import { validateGraph, hasErrors, type AutomationChannel, type ValidationIssue } from "@/lib/automations/validate";
import type { AutomationSettings } from "@/lib/automations/settings";
import type { Graph, Step, StepType } from "@/lib/automations/types";
import { connectStep, insertStep, moveStep, removeStep, updateStep, createStep, findStep, syncBranches } from "../_graph-edit";
import { CHANNEL_LABEL } from "../_shared";
import { Builder, StepPicker, type AddRequest } from "./_builder";
import { FlowBuilderPreview } from "./_flow-builder-preview";
import { StepEditor, type EditorOptions } from "./_step-editor";
import { TriggerEditor } from "./_trigger-editor";
import { Simulator } from "./_simulator";

interface AutomationDetail {
  id: string;
  name: string;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";
  draftGraph: Graph;
  settings: AutomationSettings;
  channel: AutomationChannel;
  account: { id: string; name: string };
  waAccountId: string | null;
  channelAccountId: string | null;
  publishedVersion: { version: number; publishedAt: string } | null;
  hasUnpublishedChanges: boolean;
}

const EMPTY_OPTIONS: EditorOptions = { tags: [], fields: [], templates: [], scorers: [], users: [], scoreLabels: [] };

function useIsDesktop(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(min-width: 1024px)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(min-width: 1024px)").matches,
    () => true
  );
}

export default function AutomationEditorPage() {
  const { id } = useParams<{ id: string }>();
  const { success, error: toastError } = useToast();
  const isDesktop = useIsDesktop();

  const [detail, setDetail] = useState<AutomationDetail | null>(null);
  const [graph, setGraph] = useState<Graph | null>(null);
  const [settings, setSettings] = useState<AutomationSettings | null>(null);
  const [options, setOptions] = useState<EditorOptions>(EMPTY_OPTIONS);
  const [dirty, setDirty] = useState(false);
  const [selected, setSelected] = useState<string | null>("trigger");
  const [panel, setPanel] = useState<"edit" | "test">("edit");
  const [builderView, setBuilderView] = useState<"list" | "flow">("list");
  const [addRequest, setAddRequest] = useState<AddRequest | null>(null);
  const [serverIssues, setServerIssues] = useState<ValidationIssue[]>([]);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/automations/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo cargar");
      setDetail(data);
      setGraph(data.draftGraph);
      setSettings(data.settings);
      setName(data.name);
      setDirty(false);
      const q = data.waAccountId ? `waAccountId=${data.waAccountId}` : `channelAccountId=${data.channelAccountId}`;
      const opt = await fetch(`/api/automations/options?${q}`).then((r) => r.json());
      if (!opt.error) setOptions(opt);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "No se pudo cargar");
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; load también recarga tras publicar
    load();
  }, [load]);

  // Aviso al salir con cambios sin guardar.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const issues = useMemo(() => {
    if (!graph || !detail) return [];
    const local = validateGraph(graph, detail.channel);
    // Los del servidor (plantilla ajena, usuario sin acceso…) se muestran hasta
    // el siguiente cambio.
    return [...local, ...serverIssues.filter((s) => !local.some((l) => l.nodeId === s.nodeId && l.message === s.message))];
  }, [graph, detail, serverIssues]);

  const unavailable = useMemo<StepType[]>(() => {
    if (!detail) return [];
    const list: StepType[] = [];
    if (detail.channel !== "WHATSAPP") list.push("send_template");
    if (detail.channel !== "WHATSAPP" && detail.channel !== "TELEGRAM") list.push("score_lead");
    return list;
  }, [detail]);

  const mutate = (fn: (g: Graph) => Graph) => {
    setGraph((g) => (g ? fn(g) : g));
    setDirty(true);
    setServerIssues([]);
  };

  const select = (nodeId: string) => {
    setSelected(nodeId);
    setPanel("edit");
    if (!isDesktop) setDrawerOpen(true);
  };

  const selectFlow = (nodeId: string) => {
    setSelected(nodeId);
    setPanel("edit");
  };

  const addStep = (type: StepType) => {
    if (!addRequest) return;
    const step = createStep(type);
    mutate((g) => insertStep(g, addRequest.listId, addRequest.index, step));
    setAddRequest(null);
    select(step.id);
  };

  const connectNodes = (sourceId: string, targetId: string, sourceHandle: string | null) => {
    if (!graph) return;
    const result = connectStep(graph, sourceId, targetId, sourceHandle);
    if (result.error) {
      toastError(result.error);
      return;
    }
    if (JSON.stringify(result.graph) !== JSON.stringify(graph)) mutate(() => result.graph);
    selectFlow(targetId);
  };

  async function save(): Promise<boolean> {
    if (!graph || !settings) return false;
    setSaving(true);
    try {
      const res = await fetch(`/api/automations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftGraph: graph, settings, ...(name.trim() && name !== detail?.name ? { name: name.trim() } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar");
      setDirty(false);
      setDetail((d) => (d ? { ...d, name: name.trim() || d.name, hasUnpublishedChanges: true } : d));
      return true;
    } catch (err) {
      toastError(err instanceof Error ? err.message : "No se pudo guardar");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    if (hasErrors(issues)) {
      toastError("Corrige los errores marcados antes de publicar");
      return;
    }
    setPublishing(true);
    try {
      if (dirty && !(await save())) return;
      const res = await fetch(`/api/automations/${id}/publish`, { method: "POST" });
      const data = await res.json();
      if (res.status === 422) {
        setServerIssues(data.issues ?? []);
        toastError("Hay problemas que corregir antes de publicar");
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "No se pudo publicar");
      success(`Publicada v${data.publishedVersion.version}: las nuevas ejecuciones usan esta versión`);
      await load();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "No se pudo publicar");
    } finally {
      setPublishing(false);
    }
  }

  if (loadError) return <Banner tone="danger" title="No se pudo abrir la automatización">{loadError}</Banner>;
  if (!detail || !graph || !settings) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  const selectedStep: Step | null = selected && selected !== "trigger" ? findStep(graph, selected) : null;
  const triggerText = graph.trigger.type === "keyword" ? graph.trigger.keywords[0] ?? "" : graph.trigger.type === "first_message" || graph.trigger.type === "message_received" ? "Hola" : "";

  const panelContent =
    panel === "test" ? (
      <Simulator key={`sim-${detail.id}`} automationId={detail.id} graph={graph} triggerText={triggerText} />
    ) : selected === "trigger" ? (
      <TriggerEditor
        trigger={graph.trigger}
        settings={settings}
        channel={detail.channel}
        options={options}
        issues={issues.filter((i) => i.nodeId === null)}
        onChange={(trigger) => mutate((g) => ({ ...g, trigger }))}
        onSettingsChange={(s) => {
          setSettings(s);
          setDirty(true);
        }}
      />
    ) : selectedStep ? (
      <StepEditor
        key={selectedStep.id}
        step={selectedStep}
        channel={detail.channel}
        options={options}
        issues={issues.filter((i) => i.nodeId === selectedStep.id)}
        onChange={(s) => mutate((g) => updateStep(g, s.id, () => syncBranches(s)))}
        onDelete={() => setDeleteId(selectedStep.id)}
      />
    ) : (
      <p className="text-sm text-muted">Selecciona un paso para editarlo.</p>
    );

  const errorCount = issues.filter((i) => i.level === "error").length;
  const warningCount = issues.length - errorCount;

  return (
    <div className="space-y-5">
      <div>
        <Link href="/whatsapp/automatizaciones" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground">
          <ArrowLeft size={14} />
          Automatizaciones
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {renaming ? (
                <Input
                  aria-label="Nombre"
                  value={name}
                  autoFocus
                  maxLength={120}
                  onChange={(e) => {
                    setName(e.target.value);
                    setDirty(true);
                  }}
                  onBlur={() => setRenaming(false)}
                  onKeyDown={(e) => e.key === "Enter" && setRenaming(false)}
                  className="w-72"
                />
              ) : (
                <button type="button" onClick={() => setRenaming(true)} className="group flex items-center gap-2 text-left">
                  <h1 className="font-display text-page-title font-semibold tracking-tight">{name}</h1>
                  <Pencil size={14} className="text-muted opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              )}
              <Badge size="sm" tone={detail.status === "ACTIVE" ? "success" : detail.status === "PAUSED" ? "warning" : "neutral"}>
                {detail.status === "ACTIVE" ? "Activa" : detail.status === "PAUSED" ? "Pausada" : detail.status === "DRAFT" ? "Borrador" : "Archivada"}
              </Badge>
              {detail.publishedVersion && <Badge size="sm">v{detail.publishedVersion.version} publicada</Badge>}
              {(dirty || (detail.publishedVersion && detail.hasUnpublishedChanges)) && (
                <Badge size="sm" tone="warning">{dirty ? "Sin guardar" : "Cambios sin publicar"}</Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-muted">
              {detail.account.name} · {CHANNEL_LABEL[detail.channel]}
              {errorCount > 0 && <span className="text-danger"> · {errorCount} error{errorCount === 1 ? "" : "es"}</span>}
              {warningCount > 0 && <span className="text-warning"> · {warningCount} aviso{warningCount === 1 ? "" : "s"}</span>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" icon={History} href={`/whatsapp/automatizaciones/${detail.id}/ejecuciones`}>
              Ejecuciones
            </Button>
            <Button
              variant={panel === "test" ? "primary" : "secondary"}
              size="sm"
              icon={FlaskConical}
              onClick={() => {
                setPanel(panel === "test" ? "edit" : "test");
                if (!isDesktop) setDrawerOpen(true);
              }}
            >
              Probar
            </Button>
            <Button variant="secondary" size="sm" icon={Save} onClick={save} loading={saving} disabled={!dirty}>
              Guardar
            </Button>
            <Button size="sm" icon={Rocket} onClick={publish} loading={publishing}>
              Publicar
            </Button>
          </div>
        </div>
      </div>

      {detail.status === "DRAFT" && (
        <Banner tone="info">Es un borrador: no corre hasta que la publiques. Pruébala antes con “Probar”.</Banner>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">Elige cómo explorar el mismo borrador.</p>
        <div className="flex gap-1 rounded-[12px] border border-border bg-surface p-1" role="group" aria-label="Vista del constructor">
          <button type="button" aria-pressed={builderView === "list"} onClick={() => setBuilderView("list")} className={builderView === "list" ? "flex items-center gap-1.5 rounded-[9px] bg-accent-subtle px-3 py-1.5 text-xs font-semibold text-accent-ink" : "flex items-center gap-1.5 rounded-[9px] px-3 py-1.5 text-xs text-muted hover:bg-surface-light"}><List size={14} /> Constructor</button>
          <button type="button" aria-pressed={builderView === "flow"} onClick={() => setBuilderView("flow")} className={builderView === "flow" ? "flex items-center gap-1.5 rounded-[9px] bg-accent-subtle px-3 py-1.5 text-xs font-semibold text-accent-ink" : "flex items-center gap-1.5 rounded-[9px] px-3 py-1.5 text-xs text-muted hover:bg-surface-light"}><GitBranch size={14} /> Mapa de flujo</button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        {builderView === "flow" ? (
          <FlowBuilderPreview
            graph={graph}
            issues={issues}
            selectedId={panel === "edit" ? selected : null}
            isDesktop={isDesktop}
            onSelect={selectFlow}
            onEdit={select}
            onRequestAdd={setAddRequest}
            onMove={(stepId, delta) => mutate((g) => moveStep(g, stepId, delta))}
            onConnect={connectNodes}
            onDelete={setDeleteId}
          />
        ) : (
          <Builder
            graph={graph}
            issues={issues}
            selectedId={panel === "edit" ? selected : null}
            onSelect={select}
            onRequestAdd={setAddRequest}
            onMove={(stepId, d) => mutate((g) => moveStep(g, stepId, d))}
            unavailable={unavailable}
          />
        )}
        {isDesktop && (
          <aside className="self-start rounded-2xl border border-border bg-surface p-4 shadow-sm lg:sticky lg:top-4 lg:max-h-[calc(100svh-2rem)] lg:overflow-y-auto">
            {panelContent}
          </aside>
        )}
      </div>

      {!isDesktop && (
        <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} side="right" title={panel === "test" ? "Prueba de automatización" : "Editar automatización"} width="w-full sm:w-[440px]">
          <div className="p-4">{panelContent}</div>
        </Drawer>
      )}

      <StepPicker request={addRequest} unavailable={unavailable} onPick={addStep} onClose={() => setAddRequest(null)} />
      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Eliminar paso"
        description="Se quitará este paso y, si tiene ramas, todos los pasos dentro de ellas. El cambio quedará en el borrador hasta que lo guardes."
        confirmLabel="Eliminar paso"
        onConfirm={() => {
          if (deleteId) mutate((g) => removeStep(g, deleteId));
          setDeleteId(null);
          setSelected("trigger");
          setDrawerOpen(false);
        }}
      />
    </div>
  );
}
