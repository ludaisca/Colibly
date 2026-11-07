"use client";

import { useMemo } from "react";
import {
  Background, BackgroundVariant, Controls, Handle, MiniMap, Position, ReactFlow,
  type NodeProps,
} from "@xyflow/react";
import { ArrowLeft, ArrowRight, Bot, Clock3, GitBranch, LogOut, MessageSquare, Pencil, Plus, Tag, Trash2, Zap } from "lucide-react";
import { graphToReactFlow, type AutomationFlowNode } from "@/lib/automations/react-flow";
import { connectStep } from "../_graph-edit";
import type { Graph } from "@/lib/automations/types";
import type { ValidationIssue } from "@/lib/automations/validate";
import type { AddRequest } from "./_builder";
import "@xyflow/react/dist/style.css";
import "./flow-builder-preview.css";

const icons = {
  Disparador: Zap,
  Mensajes: MessageSquare,
  Esperas: Clock3,
  Lógica: GitBranch,
  CRM: Tag,
  IA: Bot,
  Salida: LogOut,
  Rama: GitBranch,
};

function AutomationNode({ data, selected }: NodeProps<AutomationFlowNode>) {
  const Icon = icons[data.category];
  const empty = data.category === "Rama";
  return <div className={`automation-flow-node${empty ? " is-empty" : ""}${selected ? " is-selected" : ""}${data.issueLevel ? ` has-${data.issueLevel}` : ""}`}>
    {data.category !== "Disparador" && <Handle type="target" position={Position.Left} />}
    <div className="automation-flow-node-heading"><span><Icon size={15} /></span><small>{data.category}</small>{data.issueLevel && <i aria-label={data.issueLevel === "error" ? "Tiene errores" : "Tiene avisos"} />}</div>
    <strong>{data.label}</strong><p>{data.description}</p>
    {!empty && (data.branchLabels.length ? data.branchLabels.map((branch, index) => <Handle key={branch.id} id={branch.id} type="source" position={Position.Right} style={{ top: `${(index + 1) * 100 / (data.branchLabels.length + 1)}%` }} />) : <Handle type="source" position={Position.Right} />)}
  </div>;
}

const nodeTypes = { automation: AutomationNode };
type MoveTarget = { sourceId: string; sourceHandle: string | null; label: string };

export function FlowBuilderPreview({ graph, issues, selectedId, isDesktop, onSelect, onEdit, onRequestAdd, onMove, onConnect, onDelete }: {
  graph: Graph;
  issues: ValidationIssue[];
  selectedId: string | null;
  isDesktop: boolean;
  onSelect: (id: string) => void;
  onEdit: (id: string) => void;
  onRequestAdd: (request: AddRequest) => void;
  onMove: (stepId: string, delta: -1 | 1) => void;
  onConnect: (sourceId: string, targetId: string, sourceHandle: string | null) => void;
  onDelete: (stepId: string) => void;
}) {
  const flow = useMemo(() => graphToReactFlow(graph, issues), [graph, issues]);
  const nodes = useMemo(() => flow.nodes.map((node) => ({ ...node, selected: node.id === selectedId })), [flow.nodes, selectedId]);
  const triggerY = flow.nodes.find((node) => node.id === "trigger")?.position.y ?? 0;
  // Ajustar un flujo ramificado completo reduce el texto a unos pocos píxeles
  // cuando el panel de edición comparte el ancho. Empezamos por el disparador
  // a una escala legible; el minimapa y el control de ajuste muestran el total.
  const fitSmallFlow = isDesktop && flow.nodes.length <= 3;
  const selected = flow.nodes.find((node) => node.id === selectedId);
  const add = (listId: string, index: number, allowTerminal: boolean) => onRequestAdd({ listId, index, allowTerminal });
  // Alternativa al gesto de arrastrar para teclado y pantallas táctiles.
  const moveTargets = useMemo(() => {
    if (!selectedId || selectedId === "trigger" || selectedId.startsWith("empty:")) return [];
    const candidates: MoveTarget[] = [{ sourceId: "trigger", sourceHandle: null, label: "Al inicio" }];
    for (const node of flow.nodes) {
      if (node.id === "trigger" || node.id === selectedId || node.id.startsWith("empty:")) continue;
      if (node.data.branchLabels.length) {
        for (const branch of node.data.branchLabels) candidates.push({ sourceId: node.id, sourceHandle: branch.id, label: `En «${branch.label}» de ${node.data.label}` });
      } else if (!node.data.terminal) {
        candidates.push({ sourceId: node.id, sourceHandle: null, label: `Después de ${node.data.label}: ${node.data.description}` });
      }
    }
    const original = JSON.stringify(graph);
    return candidates.filter(({ sourceId, sourceHandle }) => {
      const result = connectStep(graph, sourceId, selectedId, sourceHandle);
      return !result.error && JSON.stringify(result.graph) !== original;
    });
  }, [flow.nodes, graph, selectedId]);
  return <div className="automation-flow-preview">
    <div className="automation-flow-canvas">
      <ReactFlow
        nodes={nodes} edges={flow.edges} nodeTypes={nodeTypes}
        nodesDraggable={false} nodesConnectable edgesFocusable={false}
        isValidConnection={(connection) => !connectStep(graph, connection.source, connection.target, connection.sourceHandle ?? null).error}
        onConnect={(connection) => onConnect(connection.source, connection.target, connection.sourceHandle)}
        deleteKeyCode={null} onNodeClick={(_, node) => { if (node.id.startsWith("empty:")) add(node.data.listId, 0, true); else onSelect(node.id); }}
        fitView={fitSmallFlow}
        defaultViewport={fitSmallFlow ? undefined : { x: 24, y: 170 - triggerY * 0.8, zoom: 0.8 }}
        fitViewOptions={{ padding: 0.18, maxZoom: 1.15 }} minZoom={0.12}
        aria-label="Mapa de la automatización"
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="var(--border)" />
        <Controls showInteractive={false} />
        <MiniMap nodeColor="var(--accent-strong)" maskColor="var(--background)" pannable zoomable />
      </ReactFlow>
    </div>
    {selected && <div className="automation-flow-actions"><div><strong>{selected.data.label}</strong><small>{selected.data.category === "Disparador" ? "Inicio del flujo" : `Paso ${selected.data.index + 1} de ${selected.data.listLength}`}</small></div><div className="automation-flow-action-buttons">
      {!isDesktop && <button type="button" onClick={() => onEdit(selected.id)}><Pencil size={14} /> Editar</button>}
      {moveTargets.length > 0 && <select
        aria-label="Mover paso a otra posición"
        value=""
        onChange={(event) => {
          const target = moveTargets[Number(event.target.value)];
          if (target) onConnect(target.sourceId, selected.id, target.sourceHandle);
        }}
        className="min-h-8 max-w-full rounded-[9px] border border-border bg-surface px-2 text-micro font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-accent-strong"
      ><option value="">Mover a…</option>{moveTargets.map((target, index) => <option key={`${target.sourceId}:${target.sourceHandle ?? "next"}`} value={index}>{target.label}</option>)}</select>}
      {selected.id === "trigger" ? <button type="button" onClick={() => add("root", 0, graph.steps.length === 0)}><Plus size={14} /> Añadir al inicio</button> : <>
        <button type="button" onClick={() => add(selected.data.listId, selected.data.index, false)}><Plus size={14} /> Antes</button>
        {!selected.data.terminal && <button type="button" onClick={() => add(selected.data.listId, selected.data.index + 1, selected.data.index === selected.data.listLength - 1)}><Plus size={14} /> Después</button>}
        {selected.data.canMoveUp && <button type="button" onClick={() => onMove(selected.id, -1)}><ArrowLeft size={14} /> Anterior</button>}
        {selected.data.canMoveDown && <button type="button" onClick={() => onMove(selected.id, 1)}>Siguiente <ArrowRight size={14} /></button>}
        {selected.data.branchLabels.map((branch) => <button key={branch.id} type="button" onClick={() => add(branch.id, 0, branch.length === 0)}><Plus size={14} /> En «{branch.label}»</button>)}
        <button type="button" className="automation-flow-delete" onClick={() => onDelete(selected.id)}><Trash2 size={14} /> Eliminar</button>
      </>}
    </div></div>}
    <div className="automation-flow-help">Selecciona un paso para editarlo o añadir otro. Muévelo con «Mover a…» o arrastra desde su punto derecho hasta otro paso; cada rama tiene su propia salida. Las conexiones inválidas se bloquean. Guarda el borrador antes de salir.</div>
  </div>;
}
