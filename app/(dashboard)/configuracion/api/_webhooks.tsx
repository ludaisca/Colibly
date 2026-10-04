"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Webhook, Plus, Send, History, Pencil, Pause, Play, KeyRound, Trash2 } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
import { Modal } from "@/app/components/ui/modal";
import { EntityList, EntityRow } from "@/app/components/ui/entity-list";
import { DropdownItem } from "@/app/components/ui/dropdown";
import { ConfirmDialog } from "@/app/components/ui/confirm-dialog";
import { SectionHeader } from "@/app/components/ui/section-header";
import { useToast } from "@/app/components/ui/toast";
import { SecretField } from "@/app/components/integrations/secret-field";
import { WebhookFormModal, type WebhookRow } from "./_webhook-form";
import { formatDateTime, scopeSummary, type IntegrationAccount } from "./_shared";

function webhookState(w: WebhookRow): { label: string; tone: "success" | "danger" | "neutral" } {
  if (w.disabledAt) return { label: "Desactivado por fallos", tone: "danger" };
  if (!w.active) return { label: "Pausado", tone: "neutral" };
  return { label: "Activo", tone: "success" };
}

export function WebhooksSection({ accounts }: { accounts: IntegrationAccount[] }) {
  const router = useRouter();
  const { success, error: toastError } = useToast();
  const [items, setItems] = useState<WebhookRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<WebhookRow | null>(null);
  const [deleting, setDeleting] = useState<WebhookRow | null>(null);
  const [rotating, setRotating] = useState<WebhookRow | null>(null);
  const [rotatedSecret, setRotatedSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/configuracion/webhooks");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al cargar los webhooks");
      setItems(data);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Error al cargar los webhooks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; fetchItems también refresca tras cada acción
    fetchItems();
  }, [fetchItems]);

  async function call(url: string, init: RequestInit, okMessage: string) {
    const res = await fetch(url, init);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "La acción falló");
    success(okMessage);
    return data;
  }

  async function sendTest(w: WebhookRow) {
    try {
      // Sin navegación automática: arrebatar la pantalla a los 1,2 s desorienta.
      // El resultado está en "Ver entregas" (menú de la fila o clic en la fila).
      await call(`/api/configuracion/webhooks/${w.id}/test`, { method: "POST" }, "Evento de prueba enviado. Ve el resultado en “Ver entregas”.");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "No se pudo enviar la prueba");
    }
  }

  async function toggleActive(w: WebhookRow) {
    try {
      await call(
        `/api/configuracion/webhooks/${w.id}`,
        { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !w.active }) },
        w.active ? "Webhook pausado" : "Webhook activado"
      );
      fetchItems();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "No se pudo actualizar");
    }
  }

  async function handleRotate() {
    if (!rotating) return;
    setBusy(true);
    try {
      const data = await call(`/api/configuracion/webhooks/${rotating.id}/rotate-secret`, { method: "POST" }, "Secreto rotado");
      setRotating(null);
      setRotatedSecret(data.secret);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "No se pudo rotar el secreto");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await call(`/api/configuracion/webhooks/${deleting.id}`, { method: "DELETE" }, "Webhook eliminado");
      setDeleting(null);
      fetchItems();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "No se pudo eliminar");
    } finally {
      setBusy(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  return (
    <section className="space-y-4">
      <SectionHeader
        eyebrow="Eventos salientes"
        title="Webhooks"
        action={<Button size="sm" icon={Plus} onClick={openCreate}>Nuevo webhook</Button>}
      />
      <p className="text-sm text-muted">
        Recibe en tu servidor, al instante, lo que pasa en el CRM: mensajes, contactos nuevos, cambios de etapa, citas y más.
        Un webhook que falla 20 entregas seguidas se desactiva solo y te avisa.
      </p>

      <EntityList
        rows={items}
        rowKey={(w) => w.id}
        loading={loading}
        error={fetchError}
        onRetry={fetchItems}
        emptyIcon={Webhook}
        emptyTitle="Sin webhooks"
        emptyDescription="Crea uno para enviar los eventos del CRM a tu ERP, Zapier o Make."
        emptyAction={<Button size="sm" icon={Plus} onClick={openCreate}>Nuevo webhook</Button>}
        onRowClick={(w) => router.push(`/configuracion/api/webhooks/${w.id}/entregas`)}
        renderRow={(w) => {
          const state = webhookState(w);
          return (
            <EntityRow
              leading={<Webhook size={18} className="text-muted" />}
              title={w.name}
              subtitle={
                <span className="break-all">
                  <span className="font-mono">{w.url}</span> ·{" "}
                  {w.events.includes("*") ? "todos los eventos" : `${w.events.length} evento${w.events.length === 1 ? "" : "s"}`} ·{" "}
                  {scopeSummary(w.accountIds, w.channelAccountIds, accounts)}
                </span>
              }
              badges={<Badge size="sm" tone={state.tone}>{state.label}</Badge>}
              meta={w.lastDeliveryAt ? `Último envío ${formatDateTime(w.lastDeliveryAt)}` : "Sin envíos"}
            />
          );
        }}
        rowActions={(w) => (
          <>
            <DropdownItem icon={Send} onClick={() => sendTest(w)} disabled={!w.active}>Probar</DropdownItem>
            <DropdownItem icon={History} onClick={() => router.push(`/configuracion/api/webhooks/${w.id}/entregas`)}>Ver entregas</DropdownItem>
            <DropdownItem icon={Pencil} onClick={() => { setEditing(w); setFormOpen(true); }}>Editar</DropdownItem>
            <DropdownItem icon={w.active ? Pause : Play} onClick={() => toggleActive(w)}>{w.active ? "Pausar" : "Activar"}</DropdownItem>
            <DropdownItem icon={KeyRound} onClick={() => setRotating(w)}>Rotar secreto</DropdownItem>
            <DropdownItem icon={Trash2} danger onClick={() => setDeleting(w)}>Eliminar</DropdownItem>
          </>
        )}
      />

      {formOpen && (
        <WebhookFormModal
          key={editing?.id ?? "new"}
          open={formOpen}
          onClose={() => { setFormOpen(false); setEditing(null); }}
          onSaved={fetchItems}
          accounts={accounts}
          initialData={editing}
        />
      )}

      <ConfirmDialog
        open={!!rotating}
        onClose={() => setRotating(null)}
        onConfirm={handleRotate}
        loading={busy}
        tone="warning"
        title={`¿Rotar el secreto de “${rotating?.name}”?`}
        description="El secreto actual deja de firmar de inmediato: actualiza tu servidor con el nuevo o rechazará las entregas."
        confirmLabel="Rotar"
      />
      <Modal
        open={!!rotatedSecret}
        onClose={() => setRotatedSecret(null)}
        persistent
        title="Nuevo secreto de firma"
        description="Cópialo ahora; no se vuelve a mostrar."
        size="md"
        footer={<Button onClick={() => setRotatedSecret(null)}>Listo</Button>}
      >
        {rotatedSecret && <SecretField label="Secreto de firma" value={rotatedSecret} />}
      </Modal>
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        loading={busy}
        title={`¿Eliminar “${deleting?.name}”?`}
        description="Deja de recibir eventos y se borra su registro de entregas."
        confirmLabel="Eliminar"
      />
    </section>
  );
}
