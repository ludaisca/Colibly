"use client";

import { useUrlTab } from "@/app/components/ui/tabs";

import { useState, useEffect, useCallback, useRef, useMemo, Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import { Trash2, Power, PowerOff, Send, Upload, X, RotateCcw } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Textarea } from "@/app/components/ui/textarea";
import { Input } from "@/app/components/ui/input";
import { FormField } from "@/app/components/ui/form-field";
import { Spinner } from "@/app/components/ui/spinner";
import { ConfirmDialog } from "@/app/components/ui/confirm-dialog";
import { Banner } from "@/app/components/ui/banner";
import { ListErrorState } from "@/app/components/ui/list-error-state";
import { Table, type TableColumn } from "@/app/components/ui/table";
import { SectionHeader } from "@/app/components/ui/section-header";
import { KpiStrip } from "@/app/components/ui/kpi-strip";
import { DetailPage, DetailRow } from "@/app/components/ui/detail-page";
import { useToast } from "@/app/components/ui/toast";
import { BotFormModal } from "../_form";

interface BotDetail {
  id: string;
  name: string;
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
  channelAccount: { id: string; name: string; channel: "TELEGRAM" | "MESSENGER" | "INSTAGRAM" | "WEBCHAT" } | null;
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

type TestTurn = { role: "user" | "assistant"; content: string };

const TABS = [
  { id: "config", label: "Configuración" },
  { id: "knowledge", label: "Conocimiento" },
  { id: "test", label: "Probar" },
  { id: "uso", label: "Uso" },
] as const;

function BotDetailPageContent() {
  const params = useParams();
  const router = useRouter();
  const { success, error: toastError } = useToast();
  const id = params.id as string;

  const [tab, setTab] = useUrlTab<(typeof TABS)[number]["id"]>(TABS.map((t) => t.id), "config");
  const [bot, setBot] = useState<BotDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const [knowledge, setKnowledge] = useState<KnowledgeDoc[]>([]);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [knowledgeError, setKnowledgeError] = useState<string | null>(null);
  const [docTitle, setDocTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [testMessage, setTestMessage] = useState("");
  const [testTurns, setTestTurns] = useState<TestTurn[]>([]);
  const [testing, setTesting] = useState(false);
  const testEndRef = useRef<HTMLDivElement>(null);

  const [usageData, setUsageData] = useState<UsageData | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);

  const fetchBot = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/whatsapp/bots/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al cargar el bot");
      setBot(data);
    } catch (err) { setLoadError(err instanceof Error ? err.message : "Error al cargar el bot"); } finally { setLoading(false); }
  }, [id]);

  const fetchKnowledge = useCallback(async () => {
    setKnowledgeLoading(true);
    setKnowledgeError(null);
    try {
      const res = await fetch(`/api/whatsapp/bots/${id}/knowledge`);
      const data = await res.json();
      if (!res.ok || !Array.isArray(data)) throw new Error(data.error ?? "Error al cargar documentos");
      setKnowledge(data);
    } catch (err) { setKnowledgeError(err instanceof Error ? err.message : "Error al cargar documentos"); } finally { setKnowledgeLoading(false); }
  }, [id]);

  const fetchUsage = useCallback(async () => {
    setUsageLoading(true);
    setUsageError(null);
    try {
      const res = await fetch(`/api/whatsapp/bots/${id}/usage`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al cargar uso");
      setUsageData(data);
    } catch (err) { setUsageError(err instanceof Error ? err.message : "Error al cargar uso"); } finally { setUsageLoading(false); }
  }, [id]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; fetchBot also used for manual refresh
  useEffect(() => { fetchBot(); }, [fetchBot]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-tab-switch; fetchKnowledge also used for manual refresh
  useEffect(() => { if (tab === "knowledge") fetchKnowledge(); }, [tab, fetchKnowledge]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-tab-switch
  useEffect(() => { if (tab === "uso") fetchUsage(); }, [tab, fetchUsage]);
  useEffect(() => { if (tab === "test") testEndRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [tab, testTurns, testing]);

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
    const message = testMessage.trim();
    if (!message || testing) return;
    setTesting(true);
    setTestMessage("");
    setTestTurns((prev) => [...prev, { role: "user", content: message }]);
    try {
      const res = await fetch(`/api/whatsapp/bots/${id}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history: testTurns.slice(-100) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTestTurns((prev) => [...prev, { role: "assistant", content: data.response }]);
    } catch (err) {
      setTestTurns((prev) => prev.slice(0, -1));
      setTestMessage(message);
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
  if (loadError) return <ListErrorState message={loadError} onRetry={fetchBot} />;
  if (!bot) return <Banner tone="danger" title="Bot no encontrado">El bot solicitado no existe.</Banner>;

  return (
    <DetailPage
      backHref="/whatsapp/bots"
      backLabel="Volver a bots"
      title={bot.name}
      description={bot.waAccount?.name ?? bot.channelAccount?.name ?? "Sin cuenta (solo pruebas)"}
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
          <Button variant="danger" size="sm" icon={Trash2} onClick={() => setDeleteOpen(true)} aria-label="Eliminar bot" />
        </>
      }
    >
      {bot.status === "ERROR" && (
        <Banner tone="danger" title="Este bot dejó de responder por un error">
          Quedó marcado en estado de error tras un fallo (error del proveedor de IA, etc.) y no procesará mensajes nuevos aunque esté &quot;Activo&quot;. Pausa y vuelve a activarlo para reintentar.
        </Banner>
      )}

      {tab === "config" && (
        <section>
          <dl className="space-y-3">
            <DetailRow label="Instrucciones" value={bot.systemPrompt} />
            <DetailRow label="Creatividad" value={String(bot.temperature)} />
            <DetailRow label="Largo máximo de respuesta" value={`${bot.maxTokens.toLocaleString("es-MX")} tokens`} />
            <DetailRow label="Memoria" value={bot.memoryType === "RECENT" ? `Reciente (${bot.memoryLimit} mensajes)` : bot.memoryType === "SUMMARY" ? "Resumen acumulativo" : "Ninguna"} />
            <DetailRow label="Base de conocimiento" value={bot.ragEnabled ? "Activado" : "Desactivado"} />
            <DetailRow label="Citas automáticas" value={bot.appointmentSchedulingEnabled ? "Activado" : "Desactivado"} />
            <DetailRow label="Creado" value={new Date(bot.createdAt).toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" })} />
          </dl>
        </section>
      )}

      {tab === "knowledge" && (
        <div className="space-y-6">
          {knowledgeError && <Banner tone="danger" action={<Button type="button" variant="link" size="sm" onClick={fetchKnowledge}>Reintentar</Button>}>{knowledgeError}</Banner>}
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
          {!bot.waAccountId && !bot.channelAccount && (
            <Banner tone="warning" title="Este bot aún no responde en chats">
              Asígnale una cuenta desde Editar y actívalo. La prueba de abajo consulta la IA aunque no tenga una cuenta vinculada.
            </Banner>
          )}
          {(bot.waAccountId || bot.channelAccount) && !bot.isActive && (
            <Banner tone="warning" title="Este bot está pausado">
              Actívalo para que responda a los mensajes de la cuenta vinculada.
            </Banner>
          )}
          <p className="text-xs text-muted">Conversación de prueba con la memoria y el conocimiento configurados. No envía mensajes al canal ni comprueba el webhook. Cada respuesta usa un crédito de IA.</p>
          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
              <span className="text-sm font-medium">Conversación de prueba</span>
              <Button icon={RotateCcw} variant="ghost" size="sm" onClick={() => { setTestTurns([]); setTestMessage(""); }} disabled={testing || testTurns.length === 0}>Nueva conversación</Button>
            </div>
            <div className="max-h-[min(55vh,28rem)] min-h-64 space-y-3 overflow-y-auto p-4" role="log" aria-label="Mensajes de prueba" aria-live="polite">
              {testTurns.length === 0 && <p className="py-16 text-center text-sm text-muted">Escribe un mensaje para iniciar la conversación.</p>}
              {testTurns.map((turn, index) => (
                <div key={index} className={`flex ${turn.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] whitespace-pre-wrap break-words rounded-xl px-3.5 py-2.5 text-sm ${turn.role === "user" ? "bg-accent text-white" : "border border-border bg-surface-light text-foreground"}`}>
                    {turn.content}
                  </div>
                </div>
              ))}
              {testing && <div className="flex justify-start"><div className="rounded-xl border border-border bg-surface-light px-4 py-3" aria-label="El bot está respondiendo"><Spinner /></div></div>}
              <div ref={testEndRef} />
            </div>
            <form className="flex items-end gap-2 border-t border-border p-3" onSubmit={(event) => { event.preventDefault(); handleTest(); }}>
              <div className="min-w-0 flex-1">
                <label htmlFor="bot-test-message" className="sr-only">Mensaje de prueba</label>
                <Textarea id="bot-test-message" value={testMessage} maxLength={4000} onChange={(event) => setTestMessage(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); handleTest(); } }} placeholder="Escribe un mensaje…" rows={2} className="min-h-16 resize-none" />
              </div>
              <Button type="submit" icon={Send} size="sm" disabled={testing || !testMessage.trim()} aria-label="Enviar mensaje de prueba">Enviar</Button>
            </form>
          </div>
        </section>
      )}

      {tab === "uso" && (
        <div className="space-y-6">
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
              className="rounded-xl border border-border bg-surface p-4 shadow-sm"
              columns={usageColumns}
              rows={usageData?.recent ?? []}
              rowKey={(u) => `${u.createdAt}-${u.totalTokens}-${u.estimatedCost}`}
              loading={usageLoading}
              error={usageError}
              onRetry={fetchUsage}
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

// useUrlTab lee `?tab=` con useSearchParams: la página va dentro de <Suspense>.
export default function BotDetailPage() {
  return (
    <Suspense fallback={null}>
      <BotDetailPageContent />
    </Suspense>
  );
}
