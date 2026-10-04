"use client";

import { useCallback, useState } from "react";
import {
  Background, BackgroundVariant, Controls, Handle, MiniMap, Position,
  ReactFlow, ReactFlowProvider, useEdgesState, useNodesState,
  type Edge, type Node, type NodeProps,
} from "@xyflow/react";
import { Bot, GitBranch, MessageSquare, Plus, RotateCcw, Send, Zap } from "lucide-react";
import "@xyflow/react/dist/style.css";
import "./flow-preview.css";

type Kind = "trigger" | "message" | "condition" | "assignment" | "ai";
type FlowData = { label: string; description: string; kind: Kind };
type FlowNode = Node<FlowData, "colibly">;

const initialNodes: FlowNode[] = [
  { id: "trigger", type: "colibly", position: { x: 60, y: 190 }, data: { label: "Mensaje entrante", description: "Cuando llega un mensaje nuevo", kind: "trigger" } },
  { id: "welcome", type: "colibly", position: { x: 330, y: 190 }, data: { label: "Responder al instante", description: "Saludo y primera pregunta", kind: "message" } },
  { id: "score", type: "colibly", position: { x: 600, y: 190 }, data: { label: "Calificar interés", description: "¿El lead tiene intención alta?", kind: "condition" } },
  { id: "qualified", type: "colibly", position: { x: 880, y: 65 }, data: { label: "Asignar a ventas", description: "Avisar a Mariana", kind: "assignment" } },
  { id: "nurture", type: "colibly", position: { x: 880, y: 315 }, data: { label: "Continuar conversación", description: "El bot resuelve dudas", kind: "ai" } },
];

const initialEdges: Edge[] = [
  { id: "trigger-welcome", source: "trigger", target: "welcome" },
  { id: "welcome-score", source: "welcome", target: "score" },
  { id: "score-qualified", source: "score", sourceHandle: "yes", target: "qualified", label: "Sí" },
  { id: "score-nurture", source: "score", sourceHandle: "no", target: "nurture", label: "No" },
];

const kindMeta: Record<Kind, { label: string; icon: typeof Zap }> = {
  trigger: { label: "DISPARADOR", icon: Zap },
  message: { label: "MENSAJE", icon: MessageSquare },
  condition: { label: "CONDICIÓN", icon: GitBranch },
  assignment: { label: "ASIGNACIÓN", icon: Send },
  ai: { label: "BOT IA", icon: Bot },
};

function ColiblyFlowNode({ data, selected }: NodeProps<FlowNode>) {
  const Icon = kindMeta[data.kind].icon;
  return <div className={`demo-flow-node demo-flow-node-${data.kind}${selected ? " is-selected" : ""}`}>
    {data.kind !== "trigger" && <Handle type="target" position={Position.Left} />}
    <div className="demo-flow-node-head"><span><Icon size={15} /></span><small>{kindMeta[data.kind].label}</small></div>
    <strong>{data.label}</strong><p>{data.description}</p>
    {data.kind === "condition" ? <><Handle type="source" position={Position.Right} id="yes" style={{ top: "32%" }} /><Handle type="source" position={Position.Right} id="no" style={{ top: "70%" }} /></> : <Handle type="source" position={Position.Right} />}
  </div>;
}

const nodeTypes = { colibly: ColiblyFlowNode };

export function FlowPreview() {
  return <ReactFlowProvider><FlowCanvas /></ReactFlowProvider>;
}

function FlowCanvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialEdges);
  const [selectedId, setSelectedId] = useState("score");
  const selected = nodes.find((node) => node.id === selectedId);

  const addStep = useCallback(() => {
    const extra = nodes.filter((node) => node.id.startsWith("extra-"));
    const previous = extra.at(-1) ?? nodes.find((node) => node.id === "qualified");
    if (!previous) return;
    const id = `extra-${extra.length + 1}`;
    const node: FlowNode = {
      id, type: "colibly", position: { x: previous.position.x + 270, y: previous.position.y },
      data: { label: "Nuevo mensaje", description: "Personaliza este paso", kind: "message" },
    };
    setNodes((current) => [...current, node]);
    setEdges((current) => [...current, { id: `${previous.id}-${id}`, source: previous.id, target: id }]);
    setSelectedId(id);
  }, [nodes, setNodes, setEdges]);

  function reset() {
    setNodes(initialNodes.map((node) => ({ ...node, position: { ...node.position }, data: { ...node.data } })));
    setEdges(initialEdges.map((edge) => ({ ...edge })));
    setSelectedId("score");
  }

  function updateSelected(field: "label" | "description", value: string) {
    setNodes((current) => current.map((node) => node.id === selectedId ? { ...node, data: { ...node.data, [field]: value } } : node));
  }

  return <div className="demo-flow">
    <div className="demo-flow-top"><div><strong>Bienvenida a nuevos leads</strong><p>Arrastra los pasos, amplía el lienzo y selecciona un nodo para editarlo.</p></div><div><button type="button" onClick={reset}><RotateCcw size={14} /> Restablecer</button><button type="button" onClick={addStep} className="is-primary"><Plus size={14} /> Añadir paso</button></div></div>
    <div className="demo-flow-layout">
      <div className="demo-flow-canvas" aria-label="Vista previa interactiva del flujo de automatización">
        <ReactFlow<FlowNode, Edge>
          nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes} onNodeClick={(_, node) => setSelectedId(node.id)}
          onPaneClick={() => setSelectedId("")} nodesConnectable={false} edgesReconnectable={false}
          deleteKeyCode={null} fitView fitViewOptions={{ padding: 0.15, maxZoom: 1.15 }}
          defaultEdgeOptions={{ type: "smoothstep", style: { stroke: "var(--accent-strong)", strokeWidth: 2 } }}
          proOptions={{ hideAttribution: false }}
        >
          <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="var(--border)" />
          <Controls showInteractive={false} />
          <MiniMap nodeColor="var(--accent-muted)" maskColor="var(--background)" pannable zoomable />
        </ReactFlow>
      </div>
      <aside className="demo-flow-inspector"><div className="demo-flow-inspector-title"><span><GitBranch size={15} /></span><strong>Detalle del paso</strong></div>{selected ? <div className="demo-flow-fields"><span className="demo-flow-type">{kindMeta[selected.data.kind].label}</span><label>Nombre<input value={selected.data.label} onChange={(event) => updateSelected("label", event.target.value)} maxLength={52} /></label><label>Descripción<textarea value={selected.data.description} onChange={(event) => updateSelected("description", event.target.value)} rows={4} maxLength={140} /></label><p>Esta edición solo cambia la vista previa. No ejecuta ni publica el flujo.</p></div> : <p className="demo-flow-select-hint">Selecciona un paso del lienzo para ver sus detalles.</p>}</aside>
    </div>
    <div className="demo-flow-foot"><span>React Flow · nodos personalizados</span><span>{nodes.length} pasos · {edges.length} conexiones</span></div>
  </div>;
}
