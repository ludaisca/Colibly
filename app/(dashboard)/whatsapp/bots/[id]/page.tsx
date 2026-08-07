"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { Trash2, Power, PowerOff, Send, Upload, X } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Textarea } from "@/app/components/ui/textarea";
import { Input } from "@/app/components/ui/input";
import { FormField } from "@/app/components/ui/form-field";
import { Spinner } from "@/app/components/ui/spinner";
import { ConfirmDialog } from "@/app/components/ui/confirm-dialog";
import { Banner } from "@/app/components/ui/banner";
import { Table, type TableColumn } from "@/app/components/ui/table";
import { SectionHeader } from "@/app/components/ui/section-header";
import { KpiStrip } from "@/app/components/ui/kpi-strip";
import { DetailPage, DetailRow } from "@/app/components/ui/detail-page";
import { useToast } from "@/app/components/ui/toast";
import { BotFormModal } from "../_form";

interface BotDetail {
  id: string;
  name: string;
  provider: string;
  model: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  memoryType: string;
  memoryLimit: number;
  ragEnabled: boolean;
  appointmentSchedulingEnabled: boolean;
  isActive: boolean;
  status: string;
  waAccountId: string | null;
  createdAt: string;
  updatedAt: string;
  waAccount: { id: string; name: string; phoneNumber: string | null } | null;
  _count: { conversations: number; knowledgeBots: number };
}

interface KnowledgeDoc {
  id: string;
  title: string;
  chunkIndex: number;
  sourceName: string | null;
  createdAt: string;
}

interface UsageData {
  total: { totalTokens: number; estimatedCost: number; interactions: number };
  today: { totalTokens: number; estimatedCost: number };
  month: { totalTokens: number; estimatedCost: number };
  recent: Array<{ totalTokens: number; estimatedCost: number; createdAt: string }>;
}

const TABS = [
  { id: "config", label: "Configuración" },
  { id: "knowledge", label: "Conocimiento" },
  { id: "test", label: "Probar" },
  { id: "uso", label: "Uso" },
] as const;

export default function BotDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { success, error: toastError } = useToast();
  const id = params.id as string;

  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("config");
  const [bot, setBot] = useState<BotDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const [knowledge, setKnowledge] = useState<KnowledgeDoc[]>([]);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [docTitle, setDocTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [testMessage, setTestMessage] = useState("");
  const [testResponse, setTestResponse] = useState("");
  const [testing, setTesting] = useState(false);

  const [usageData, setUsageData] = useState<UsageData | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);

  const fetchBot = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/whatsapp/bots/${id}`);
      const data = await res.json();
      if (res.ok) setBot(data);
    } catch { toastError("Error al cargar"); } finally { setLoading(false); }
  }, [id, toastError]);

  const fetchKnowledge = useCallback(async () => {
    setKnowledgeLoading(true);
    try {
      const res = await fetch(`/api/whatsapp/bots/${id}/knowledge`);
      const data = await res.json();
      if (Array.isArray(data)) setKnowledge(data);
    } catch { /* */ } finally { setKnowledgeLoading(false); }
  }, [id]);

  const fetchUsage = useCallback(async () => {
    setUsageLoading(true);
    try {
      const res = await fetch(`/api/whatsapp/bots/${id}/usage`);
      const data = await res.json();
      if (res.ok) setUsageData(data);
    } catch { /* */ } finally { setUsageLoading(false); }
  }, [id]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; fetchBot also used for manual refresh
  useEffect(() => { fetchBot(); }, [fetchBot]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-tab-switch; fetchKnowledge also used for manual refresh
  useEffect(() => { if (tab === "knowledge") fetchKnowledge(); }, [tab, fetchKnowledge]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-tab-switch
  useEffect(() => { if (tab === "uso") fetchUsage(); }, [tab, fetchUsage]);

  async function handleToggle() {
    setToggling(true);
    try {
      const res = await fetch(`/api/whatsapp/bots/${id}/toggle`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBot((prev) => prev ? { ...prev, isActive: data.isActive } : null);
      success(data.isActive ? "Bot activado" : "Bot pausado");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Error");
    } finally { setToggling(false); }
  }

  async function handleDelete() {
    try {
      const res = await fetch(`/api/whatsapp/bots/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Error al eliminar");
      }
      success("Bot eliminado");
      router.push("/whatsapp/bots");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Error al eliminar");
    } finally { setDeleteOpen(false); }
  }

  async function handleUpload() {
    if (!selectedFile) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("title", docTitle || selectedFile.name);
      formData.append("botIds", id);

      const res = await fetch(`/api/whatsapp/bots/${id}/knowledge/upload`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      success(`Documento indexado`);
      setSelectedFile(null);
      setDocTitle("");
      if (fileRef.current) fileRef.current.value = "";
      fetchKnowledge();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Error");
    } finally { setUploading(false); }
  }

  async function handleDeleteDoc(kid: string) {
    setDeletingDocId(kid);
    try {
      const res = await fetch(`/api/whatsapp/bots/${id}/knowledge/${kid}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Error al eliminar");
      }
      setKnowledge((prev) => prev.filter((k) => k.id !== kid));
      success("Documento eliminado");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Error al eliminar");
    } finally { setDeletingDocId(null); }
  }

  async function handleTest() {
    if (!testMessage.trim()) return;
    setTesting(true);
    setTestResponse("");
    try {
      const res = await fetch(`/api/whatsapp/bots/${id}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: testMessage }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTestResponse(data.response);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Error en el test");
    } finally { setTesting(false); }
  }

  const usageColumns: TableColumn<UsageData["recent"][number]>[] = useMemo(() => [
    {
      key: "createdAt",
      header: "Fecha",
      render: (u) => (
        <span className="text-xs">
          {new Date(u.createdAt).toLocaleDateString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
        </span>
      ),
    },
    {
      key: "totalTokens",
      header: "Tokens",
      headerClassName: "text-right",
      cellClassName: "text-right",
      render: (u) => <span className="font-mono text-xs">{u.totalTokens.toLocaleString()}</span>,
    },
    {
      key: "estimatedCost",
      header: "Costo",
      headerClassName: "text-right",
      cellClassName: "text-right",
      render: (u) => <span className="font-mono text-xs">${u.estimatedCost.toFixed(4)}</span>,
    },
  ], []);

  if (loading) return <div className="flex items-center justify-center py-16"><Spinner /></div>;
  if (!bot) return <Banner tone="danger" title="Bot no encontrado">El bot solicitado no existe.</Banner>;

  return (
    <DetailPage
      backHref="/whatsapp/bots"
      backLabel="Volver a bots"
      title={bot.name}
      description={`${bot.waAccount?.name ?? "Sin cuenta (solo pruebas)"} · ${bot.provider === "openrouter" ? "OpenRouter" : "Gemini"} · ${bot.model}`}
      maxWidth="max-w-3xl"
      tabs={TABS as unknown as { id: string; label: string }[]}
      activeTab={tab}
      onTabChange={(t) => setTab(t as (typeof TABS)[number]["id"])}
      actions={
        <>
          <Button
            icon={bot.isActive ? PowerOff : Power}
            variant={bot.isActive ? "secondary" : "primary"}
            size="sm"
            onClick={handleToggle}
            disabled={toggling}
          >
            {toggling ? <Spinner /> : bot.isActive ? "Pausar" : "Activar"}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>Editar</Button>
          <Button variant="danger" size="sm" icon={Trash2} onClick={() => setDeleteOpen(true)} />
        </>
      }
    >
      {bot.status === "ERROR" && (
        <Banner tone="danger" title="Este bot dejó de responder por un error">
          Quedó marcado en estado de error tras un fallo (API key inválida, error del proveedor, etc.) y no procesará mensajes nuevos aunque esté &quot;Activo&quot;. Pausa y vuelve a activarlo para reintentar.
        </Banner>
      )}

      {tab === "config" && (
        <section>
          <dl className="space-y-3">
            <DetailRow label="Prompt del sistema" value={bot.systemPrompt} />
            <DetailRow label="Temperatura" value={String(bot.temperature)} />
            <DetailRow label="Max tokens" value={String(bot.maxTokens)} />
            <DetailRow label="Memoria" value={bot.memoryType === "RECENT" ? `Reciente (${bot.memoryLimit} msgs)` : bot.memoryType === "SUMMARY" ? "Resumen acumulativo" : "Ninguna"} />
            <DetailRow label="RAG" value={bot.ragEnabled ? "Activado" : "Desactivado"} />
            <DetailRow label="Citas automáticas" value={bot.appointmentSchedulingEnabled ? "Activado" : "Desactivado"} />
            <DetailRow label="Creado" value={new Date(bot.createdAt).toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" })} />
          </dl>
        </section>
      )}

      {tab === "knowledge" && (
        <div className="space-y-8">
          <section className="space-y-4">
            <SectionHeader title="Subir documento" />
            <div className="space-y-3">
              <FormField label="Título">
                {(id) => <Input id={id} value={docTitle} onChange={(e) => setDocTitle(e.target.value)} placeholder="Ej: Manual de soporte" />}
              </FormField>
              <FormField label="Archivo" hint=".txt, .md, .csv, .json (máx 10MB)">
                {(id) => (
                  <input
                    id={id}
                    ref={fileRef}
                    type="file"
                    accept=".txt,.md,.csv,.json"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                    className="block w-full text-sm text-foreground file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-surface-light file:text-foreground hover:file:bg-surface file:cursor-pointer"
                  />
                )}
              </FormField>
              <Button icon={Upload} size="sm" onClick={handleUpload} disabled={uploading || !selectedFile}>
                {uploading ? <Spinner /> : "Indexar documento"}
              </Button>
            </div>
          </section>

          <section className="space-y-4">
            <SectionHeader title={`Documentos indexados (${knowledge.length})`} />
            {knowledgeLoading ? <Spinner /> : knowledge.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted">Sin documentos. Sube archivos para la base de conocimiento.</p>
            ) : (
              <div className="divide-y divide-border rounded-xl border border-border">
                {knowledge.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-medium">{doc.title}</p>
                      <p className="text-xs text-muted-darker">Chunk {doc.chunkIndex}{doc.sourceName ? ` · ${doc.sourceName}` : ""} · {new Date(doc.createdAt).toLocaleDateString("es-MX")}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={deletingDocId === doc.id ? undefined : X}
                      onClick={() => handleDeleteDoc(doc.id)}
                      disabled={deletingDocId === doc.id}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {tab === "test" && (
        <section className="space-y-4">
          <SectionHeader title="Probar el bot" />
          <FormField label="Mensaje de prueba">
            {(id) => (
              <Textarea id={id} value={testMessage} onChange={(e) => setTestMessage(e.target.value)} placeholder="Escribe un mensaje para probar..." rows={3} />
            )}
          </FormField>
          <Button icon={Send} size="sm" onClick={handleTest} disabled={testing || !testMessage.trim()}>
            {testing ? <Spinner /> : "Enviar"}
          </Button>
          {testResponse && (
            <div className="rounded-lg border border-border bg-surface p-4">
              <p className="mb-2 text-xs font-medium text-muted-darker">Respuesta:</p>
              <p className="whitespace-pre-wrap text-sm">{testResponse}</p>
            </div>
          )}
        </section>
      )}

      {tab === "uso" && (
        <div className="space-y-8">
          <KpiStrip
            size="compact"
            items={[
              { label: "Hoy", value: usageData?.today.totalTokens?.toLocaleString() ?? "—", hint: `$${(usageData?.today?.estimatedCost ?? 0).toFixed(4)}` },
              { label: "Este mes", value: usageData?.month.totalTokens?.toLocaleString() ?? "—", hint: `$${(usageData?.month?.estimatedCost ?? 0).toFixed(4)}` },
              { label: "Total", value: usageData?.total.totalTokens?.toLocaleString() ?? "—", hint: `$${(usageData?.total?.estimatedCost ?? 0).toFixed(4)}` },
            ]}
          />

          <section className="space-y-4">
            <SectionHeader title={`Últimas interacciones (${usageData?.total.interactions ?? 0} total)`} />
            <Table
              columns={usageColumns}
              rows={usageData?.recent ?? []}
              rowKey={(u) => `${u.createdAt}-${u.totalTokens}-${u.estimatedCost}`}
              loading={usageLoading}
              emptyIcon={Send}
              emptyTitle="Sin datos de uso aún"
            />
          </section>
        </div>
      )}

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Eliminar bot"
        description={`¿Estás seguro de eliminar "${bot.name}"?`}
        confirmLabel="Eliminar"
        tone="danger"
        onConfirm={handleDelete}
      />

      <BotFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        editId={bot.id}
        onSaved={fetchBot}
      />
    </DetailPage>
  );
}
