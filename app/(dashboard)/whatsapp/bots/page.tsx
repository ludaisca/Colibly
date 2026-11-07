"use client";

import { Tooltip } from "@/app/components/ui/tooltip";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Bot, Power, PowerOff, Trash2 } from "lucide-react";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Spinner } from "@/app/components/ui/spinner";
import { EntityList, EntityRow } from "@/app/components/ui/entity-list";
import { EntityAvatar } from "@/app/components/ui/avatar";
import { ConfirmDialog } from "@/app/components/ui/confirm-dialog";
import { PageHeader } from "@/app/components/ui/page-header";
import { useToast } from "@/app/components/ui/toast";
import { BotFormModal } from "./_form";

interface WaBot {
  id: string;
  name: string;
  isActive: boolean;
  status: string;
  waAccountId: string | null;
  memoryType: string;
  ragEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  waAccount: { id: string; name: string; phoneNumber: string | null } | null;
  channelAccountId: string | null;
  channelAccount: { id: string; name: string; channel: "TELEGRAM" | "MESSENGER" | "INSTAGRAM" | "WEBCHAT" } | null;
  _count: { conversations: number; knowledgeBots: number };
}

export default function BotsPage() {
  const router = useRouter();
  const { success, error: toastError } = useToast();
  const [bots, setBots] = useState<WaBot[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const fetchBots = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/whatsapp/bots");
      const data = await res.json();
      if (!res.ok || !Array.isArray(data)) throw new Error(data.error ?? "Error al cargar bots");
      setBots(data);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Error al cargar bots");
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; fetchBots also used for manual refresh
  useEffect(() => { fetchBots(); }, [fetchBots]);

  async function handleDelete() {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/whatsapp/bots/${deleteId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Error al eliminar");
      success("Bot eliminado");
      setBots((prev) => prev.filter((b) => b.id !== deleteId));
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Error al eliminar");
    } finally {
      setDeleteId(null);
    }
  }

  async function handleToggle(botId: string) {
    setTogglingId(botId);
    try {
      const res = await fetch(`/api/whatsapp/bots/${botId}/toggle`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBots((prev) =>
        prev.map((b) => (b.id === botId ? { ...b, isActive: data.isActive, status: data.status } : b))
      );
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Error al cambiar estado");
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Bots IA"
        description="Configura bots con IA para responder automáticamente en tus canales."
        actions={
          <Button icon={Plus} size="sm" onClick={() => setFormOpen(true)}>
            Crear bot
          </Button>
        }
      />

      <EntityList
        rows={bots}
        rowKey={(bot) => bot.id}
        loading={loading}
        error={fetchError}
        onRetry={fetchBots}
        emptyIcon={Bot}
        emptyTitle="Sin bots"
        emptyDescription="Crea tu primer bot de IA para automatizar conversaciones en tus canales."
        onRowClick={(bot) => router.push(`/whatsapp/bots/${bot.id}`)}
        renderRow={(bot) => {
          return (
            <>
            <EntityRow
              leading={<EntityAvatar id={bot.waAccountId ?? bot.channelAccountId ?? bot.id} name={bot.name} size="sm" figure seed={bot.id} />}
              title={
                <Link
                  href={`/whatsapp/bots/${bot.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex min-h-6 items-center hover:text-accent-ink transition-colors"
                >
                  {bot.name}
                </Link>
              }
              badges={
                <span className="flex shrink-0 items-center gap-1">
                  {bot.ragEnabled && <Badge tone="success" size="sm" className="hidden md:inline-flex">RAG</Badge>}
                  <Badge tone={bot.isActive ? "success" : "neutral"} size="sm">
                    {bot.isActive ? "Activo" : "Inactivo"}
                  </Badge>
                  {bot.status === "ERROR" && (
                    <Badge tone="danger" size="sm">Error — reactivar para reintentar</Badge>
                  )}
                </span>
              }
              subtitle={
                <>
                  {/* Un bot de Telegram cuelga de channelAccount, no de
                      waAccount — sin este fallback se mostraba como "Sin
                      cuenta (solo pruebas)" aunque sí atiende mensajes reales. */}
                  {bot.waAccount?.name
                    ?? (bot.channelAccount ? `${bot.channelAccount.name} · ${bot.channelAccount.channel === "WEBCHAT" ? "Chat web" : bot.channelAccount.channel.charAt(0) + bot.channelAccount.channel.slice(1).toLowerCase()}` : "Sin cuenta (solo pruebas)")} ·{" "}
                  {bot._count.conversations} conversaciones · {bot._count.knowledgeBots} docs
                </>
              }
              meta={
                <span className="font-mono">{bot._count.conversations} conv.</span>
              }
            />
            <span
              className="flex shrink-0 items-center gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              <Tooltip label={bot.isActive ? "Desactivar" : "Activar"}><button aria-label={bot.isActive ? "Desactivar" : "Activar"}
                onClick={() => handleToggle(bot.id)}
                disabled={togglingId === bot.id}
                className={`p-1.5 rounded-md transition-colors ${
                  bot.isActive
                    ? "bg-success-bg text-success hover:bg-success-bg/80"
                    : "bg-surface-light text-muted-darker hover:text-foreground"
                }`}
              >
                {togglingId === bot.id ? (
                  <Spinner size="sm" />
                ) : bot.isActive ? (
                  <Power size={14} />
                ) : (
                  <PowerOff size={14} />
                )}
              </button></Tooltip>
              <Button
                variant="ghost"
                size="sm"
                icon={Trash2}
                onClick={() => setDeleteId(bot.id)}
                className="text-muted-darker hover:text-danger"
                title="Eliminar"
              />
            </span>
          </>
          );
        }}
      />

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Eliminar bot"
        description="Esta acción eliminará permanentemente el bot y todas sus conversaciones y documentos de conocimiento. No se puede deshacer."
        confirmLabel="Eliminar"
        tone="danger"
        onConfirm={handleDelete}
      />

      <BotFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={fetchBots}
      />
    </div>
  );
}
