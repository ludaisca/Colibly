"use client";

import { Fragment, useEffect, useRef } from "react";
import { Plus, ChevronUp, ChevronDown, AlertTriangle, XCircle } from "lucide-react";
import { Modal } from "@/app/components/ui/modal";
import { IconBox } from "@/app/components/ui/icon-box";
import { cn } from "@/app/components/ui/cn";
import { isBranching, type Branch, type Graph, type Step, type StepType } from "@/lib/automations/types";
import { STEP_META, TRIGGER_META, stepLabel, triggerSummary, formatDuration, type StepGroup } from "@/lib/automations/labels";
import type { ValidationIssue } from "@/lib/automations/validate";
import { isTerminal, isTerminalType, ROOT } from "../_graph-edit";
import { STEP_ICON, stepTone, TriggerIcon } from "../_shared";

// Constructor vertical: el disparador arriba, los pasos en columna y las
// ramas abriéndose en columnas lado a lado (con scroll horizontal propio del
// lienzo). Las ramas no se reúnen: cada columna termina por su cuenta.

interface BuilderProps {
  graph: Graph;
  issues: ValidationIssue[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRequestAdd: (request: AddRequest) => void;
  onMove: (stepId: string, delta: -1 | 1) => void;
  // Tipos que el canal no admite (p. ej. plantillas fuera de WhatsApp).
  unavailable: StepType[];
}

const GROUPS: StepGroup[] = ["Mensajes", "Esperas", "Lógica", "CRM", "IA", "Salida"];

export function Builder(props: BuilderProps) {
  const triggerIssues = props.issues.filter((i) => i.nodeId === null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Con ramas más anchas que el lienzo, el scroll horizontal arranca a la
  // izquierda y el disparador (centrado arriba) quedaba fuera de vista: se
  // centra el elemento seleccionado — al abrir, el disparador.
  useEffect(() => {
    const canvas = canvasRef.current;
    const target = canvas?.querySelector<HTMLElement>(`[data-node-id="${props.selectedId ?? "trigger"}"]`);
    if (!canvas || !target) return;
    const offset = target.offsetLeft + target.offsetWidth / 2 - canvas.clientWidth / 2;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    canvas.scrollTo({ left: Math.max(0, offset), behavior: reduceMotion ? "auto" : "smooth" });
  }, [props.selectedId]);

  return (
    <div ref={canvasRef} className="relative overflow-x-auto rounded-2xl border border-border bg-surface-light/40 p-6">
      <div className="mx-auto flex w-max min-w-full flex-col items-center">
        <button
          type="button"
          data-node-id="trigger"
          aria-pressed={props.selectedId === "trigger"}
          onClick={() => props.onSelect("trigger")}
          className={cn(
            "flex w-[280px] items-center gap-3 rounded-xl border bg-surface p-3 text-left shadow-sm transition-shadow hover:shadow-md",
            props.selectedId === "trigger" ? "border-accent-strong ring-2 ring-accent-muted" : "border-border"
          )}
        >
          <IconBox icon={TriggerIcon} size="sm" tone="warning" />
          <div className="min-w-0 flex-1">
            <p className="text-eyebrow font-medium uppercase tracking-wider text-muted-darker">Cuando</p>
            <p className="truncate text-sm font-medium text-foreground">{TRIGGER_META[props.graph.trigger.type].label}</p>
            <p className="truncate text-xs text-muted">{triggerSummary(props.graph.trigger)}</p>
          </div>
          <IssueMark issues={triggerIssues} />
        </button>
        <StepList {...props} listId={ROOT} steps={props.graph.steps} />
      </div>
    </div>
  );
}

function StepList(props: BuilderProps & { listId: string; steps: Step[] }) {
  const { steps, listId } = props;
  const last = steps[steps.length - 1];
  const canAppend = !last || !isTerminal(last);
  return (
    <div className="flex flex-col items-center">
      {steps.map((step, i) => (
        <Fragment key={step.id}>
          <Connector>
            <AddButton {...props} listId={listId} index={i} allowTerminal={false} after={afterLabel(steps, i, listId)} />
          </Connector>
          <StepCard
            step={step}
            issues={props.issues.filter((x) => x.nodeId === step.id)}
            selected={props.selectedId === step.id}
            onSelect={() => props.onSelect(step.id)}
            canUp={i > 0 && !isTerminal(step) && !isTerminal(steps[i - 1])}
            canDown={i < steps.length - 1 && !isTerminal(step) && !isTerminal(steps[i + 1])}
            onMove={(d) => props.onMove(step.id, d)}
          />
          {isBranching(step) && <Branches {...props} step={step} branches={step.branches} />}
        </Fragment>
      ))}
      {canAppend && (
        <>
          <Connector />
          <AddButton {...props} listId={listId} index={steps.length} allowTerminal prominent={steps.length === 0} after={afterLabel(steps, steps.length, listId)} />
        </>
      )}
    </div>
  );
}

// Dónde cae el paso nuevo, para el nombre accesible de cada "+" (todos se
// llamaban igual: "Agregar paso").
function afterLabel(steps: Step[], index: number, listId: string): string {
  if (index > 0) return `después de ${STEP_META[steps[index - 1].type].label}`;
  return listId === ROOT ? "después del disparador" : "al inicio de la rama";
}

function Branches(props: BuilderProps & { step: Step; branches: Branch[] }) {
  return (
    <div className="flex items-start gap-6 pt-3">
      {props.branches.map((b) => (
        <div key={b.id} className="flex min-w-[280px] flex-col items-center">
          <span
            className={cn(
              "max-w-[260px] truncate rounded-full border px-3 py-1 text-xs font-medium",
              b.key === "timeout" || b.key === "other" || b.key === "no"
                ? "border-border bg-surface text-muted"
                : "border-accent-muted bg-accent-subtle text-accent-ink"
            )}
            title={b.label}
          >
            {b.label}
          </span>
          <StepList {...props} listId={b.id} steps={b.steps} />
          {b.steps.length === 0 && <p className="mt-1 text-xs text-muted-darker">Sin pasos: aquí termina</p>}
        </div>
      ))}
    </div>
  );
}

function Connector({ children }: { children?: React.ReactNode }) {
  return (
    <div className="relative flex h-10 w-px items-center justify-center bg-border">
      {children && <div className="absolute">{children}</div>}
    </div>
  );
}

function AddButton(props: BuilderProps & { listId: string; index: number; allowTerminal: boolean; prominent?: boolean; after: string }) {
  return (
    <button
      type="button"
      onClick={() => props.onRequestAdd({ listId: props.listId, index: props.index, allowTerminal: props.allowTerminal })}
      className={cn(
        "flex items-center justify-center border bg-surface text-muted shadow-sm transition-colors hover:border-accent-strong hover:text-accent-ink",
        // El "+" pequeño amplía su zona táctil con un pseudo-elemento: no mueve el layout.
        props.prominent ? "h-9 gap-1.5 rounded-[12px] px-3 text-xs font-medium" : "relative h-6 w-6 rounded-full before:absolute before:-inset-2.5"
      )}
      aria-label={`Agregar paso ${props.after}`}
    >
      <Plus size={props.prominent ? 14 : 13} />
      {props.prominent && "Agregar paso"}
    </button>
  );
}

export interface AddRequest {
  listId: string;
  index: number;
  allowTerminal: boolean;
}

// Selector de tipo de paso (modal): los que solo pueden ir al final de una
// columna o que el canal no admite aparecen deshabilitados con el motivo.
export function StepPicker({
  request,
  unavailable,
  onPick,
  onClose,
}: {
  request: AddRequest | null;
  unavailable: StepType[];
  onPick: (type: StepType) => void;
  onClose: () => void;
}) {
  return (
    <Modal open={!!request} onClose={onClose} title="Agregar paso" size="xl">
      <div className="space-y-5">
        {GROUPS.map((group) => (
          <section key={group}>
            <p className="mb-2 text-eyebrow font-medium uppercase tracking-wider text-muted-darker">{group}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {(Object.entries(STEP_META) as [StepType, (typeof STEP_META)[StepType]][])
                .filter(([, m]) => m.group === group)
                .map(([type, meta]) => {
                  const byPosition = !!request && !request.allowTerminal && isTerminalType(type);
                  const byChannel = unavailable.includes(type);
                  return (
                    <button
                      key={type}
                      type="button"
                      disabled={byPosition || byChannel}
                      onClick={() => onPick(type)}
                      className="flex items-start gap-3 rounded-xl border border-border p-3 text-left transition-colors hover:border-accent-strong hover:bg-accent-subtle disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-border disabled:hover:bg-transparent"
                    >
                      <IconBox icon={STEP_ICON[type]} size="sm" tone={stepTone(type)} />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-foreground">{meta.label}</span>
                        <span className="block text-xs text-muted">
                          {byPosition ? "Solo al final de una columna (abre ramas o termina)" : byChannel ? "No disponible en este canal" : meta.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
            </div>
          </section>
        ))}
      </div>
    </Modal>
  );
}

function StepCard({
  step,
  issues,
  selected,
  onSelect,
  canUp,
  canDown,
  onMove,
}: {
  step: Step;
  issues: ValidationIssue[];
  selected: boolean;
  onSelect: () => void;
  canUp: boolean;
  canDown: boolean;
  onMove: (d: -1 | 1) => void;
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        data-node-id={step.id}
        aria-pressed={selected}
        onClick={onSelect}
        className={cn(
          "flex w-[280px] items-start gap-3 rounded-xl border bg-surface p-3 text-left shadow-sm transition-shadow hover:shadow-md",
          selected ? "border-accent-strong ring-2 ring-accent-muted" : issues.some((i) => i.level === "error") ? "border-danger-border" : "border-border"
        )}
      >
        <IconBox icon={STEP_ICON[step.type]} size="sm" tone={stepTone(step.type)} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{STEP_META[step.type].label}</p>
          <p className="line-clamp-2 text-xs text-muted">{stepSummary(step)}</p>
        </div>
        <IssueMark issues={issues} />
      </button>
      {(canUp || canDown) && (
        // Solo se esconde donde hay hover real: en táctil siempre se ve.
        <div className="absolute -right-8 top-1/2 flex -translate-y-1/2 flex-col transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100">
          <button type="button" disabled={!canUp} onClick={() => onMove(-1)} className="flex h-8 w-8 items-center justify-center rounded text-muted hover:text-foreground disabled:opacity-30" aria-label="Subir paso">
            <ChevronUp size={16} />
          </button>
          <button type="button" disabled={!canDown} onClick={() => onMove(1)} className="flex h-8 w-8 items-center justify-center rounded text-muted hover:text-foreground disabled:opacity-30" aria-label="Bajar paso">
            <ChevronDown size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

function IssueMark({ issues }: { issues: ValidationIssue[] }) {
  if (issues.length === 0) return null;
  const error = issues.some((i) => i.level === "error");
  const Icon = error ? XCircle : AlertTriangle;
  return (
    <span
      role="img"
      aria-label={`${error ? "Error" : "Aviso"}: ${issues.map((i) => i.message).join(". ")}`}
      title={issues.map((i) => i.message).join("\n")}
      className={cn("shrink-0", error ? "text-danger" : "text-warning")}
    >
      <Icon size={16} />
    </span>
  );
}

export function stepSummary(step: Step): string {
  switch (step.type) {
    case "send_text":
      return step.config.text.trim() || "Sin texto todavía";
    case "send_buttons":
    case "send_list":
      return `${step.config.text.trim() || "Sin texto"} · ${step.config.options.map((o) => o.title).join(" / ")}`;
    case "wait":
      return `Espera ${formatDuration(step.config.minutes)}`;
    case "wait_for_reply":
      return `Hasta ${formatDuration(step.config.timeoutMinutes)}${step.config.saveToVar ? ` · guarda en {{var.${step.config.saveToVar}}}` : ""}`;
    case "condition":
      return `${step.config.rules.length} regla${step.config.rules.length === 1 ? "" : "s"} · ${step.config.match === "all" ? "todas" : "alguna"}`;
    case "ai_classify":
      return step.config.categories.map((c) => c.label).join(" / ");
    case "ai_extract":
      return step.config.what || "Describe el dato";
    case "webhook":
      return `${step.config.method} ${step.config.url}`;
    case "notify_team":
      return step.config.title;
    case "assign":
      return step.config.mode === "auto" ? "Autoasignación de la cuenta" : "A una persona";
    case "handoff":
      return step.config.message ?? "Sin mensaje";
    default:
      return stepLabel(step);
  }
}
