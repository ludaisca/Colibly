"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Plus, Bot, Trash2 } from "lucide-react";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Switch } from "@/app/components/ui/switch";
import { EntityList, EntityRow } from "@/app/components/ui/entity-list";
import { EntityAvatar } from "@/app/components/ui/avatar";
import { ConfirmDialog } from "@/app/components/ui/confirm-dialog";
import { PageHeader } from "@/app/components/ui/page-header";
import { useToast } from "@/app/components/ui/toast";
import { BotFormModal } from "./_form";
import { plural } from "@/lib/format/plural";
import { channelAndAccount } from "@/lib/chats/display-name";
import { Tooltip } from "@/app/components/ui/tooltip";
import { StarterTemplates } from "@/app/components/ui/starter-templates";
import { BOT_TEMPLATES, CLASSIFY_AUTOMATION_HREF, type BotPreset } from "@/lib/onboarding/starter-templates";

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
  const { success, error: toastError } = useToast();
  const [bots, setBots] = useState<WaBot[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [preset, setPreset] = useState<BotPreset | null>(null);

  const fetchBots = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      // Con tope: si la API no responde se ve el error con reintento, no skeletons para siempre.
      const res = await fetch("/api/whatsapp/bots", { signal: AbortSignal.timeout(15_000) });
      const data = await res.json();
      if (!res.ok || !Array.isArray(data)) throw new Error(data.error ?? "Error al cargar bots");
      setBots(data);
    } catch (err) {
      setFetchError(err instanceof DOMException && err.name === "TimeoutError" ? "Los bots tardaron demasiado en cargar. Intenta de nuevo." : err instanceof Error ? err.message : "Error al cargar bots");
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
          <Button icon={Plus} size="sm" onClick={() => { setPreset(null); setFormOpen(true); }}>
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
        emptyTitle="Tu primer bot de IA"
        emptyDescription="Un bot contesta solo, a cualquier hora, con lo que sabe tu negocio, y pasa el chat a una persona cuando hace falta. Empieza con una plantilla:"
        emptyAction={
          <div className="space-y-3">
            <StarterTemplates
              cards={[
                ...BOT_TEMPLATES.map((t) => ({ id: t.id, title: t.title, description: t.description, onSelect: () => { setPreset(t.preset); setFormOpen(true); } })),
                { id: "clasifica", title: "Calificar y organizar", description: "La IA entiende qué quiere el cliente, lo etiqueta (Interesado, Cita, Queja) y lo mueve en el embudo.", href: CLASSIFY_AUTOMATION_HREF },
              ]}
            />
            <Button variant="ghost" size="sm" icon={Plus} onClick={() => { setPreset(null); setFormOpen(true); }}>O crear uno desde cero</Button>
          </div>
        }
        rowHref={(bot) => `/whatsapp/bots/${bot.id}`}
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
                  {!bot.waAccountId && !bot.channelAccountId ? (
                    <Badge tone="info" size="sm">Solo pruebas</Badge>
                  ) : (
                    <Badge tone={bot.isActive ? "success" : "neutral"} size="sm">
                      {bot.isActive ? "Activo" : "Inactivo"}
                    </Badge>
                  )}
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
                    ?? (bot.channelAccount ? channelAndAccount(bot.channelAccount.channel === "WEBCHAT" ? "Chat web" : bot.channelAccount.channel.charAt(0) + bot.channelAccount.channel.slice(1).toLowerCase(), bot.channelAccount.name) : "Sin cuenta (solo pruebas)")} ·{" "}
                  {plural(bot._count.conversations, "conversación", "conversaciones")} · {plural(bot._count.knowledgeBots, "documento")}
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
              <Switch checked={bot.isActive} onCheckedChange={() => handleToggle(bot.id)} disabled={togglingId === bot.id || (!bot.isActive && !bot.waAccountId && !bot.channelAccountId)} label={`Bot ${bot.name} activo`} />
              <Tooltip label="Eliminar bot"><Button
                variant="ghost"
                size="sm"
                icon={Trash2}
                onClick={() => setDeleteId(bot.id)}
                className="text-muted-darker hover:text-danger"
                aria-label="Eliminar bot"
              /></Tooltip>
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
        onClose={() => { setFormOpen(false); setPreset(null); }}
        onSaved={fetchBots}
        preset={preset}
      />
    </div>
  );
}
