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

function webhookState(w: WebhookRow): { label: string; tone: "success" | "danger" | "neutral" | "warning" } {
  if (w.status === "paused") return { label: "Pausado: su creador ya no es admin", tone: "warning" };
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
  const [claiming, setClaiming] = useState<WebhookRow | null>(null);
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
      await call(`/api/configuracion/webhooks/${w.id}/test`, { method: "POST" }, "Evento de prueba enviado — revisa las entregas");
      setTimeout(() => router.push(`/configuracion/api/webhooks/${w.id}/entregas`), 1200);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "No se pudo enviar la prueba");
    }
  }

  async function toggleActive(w: WebhookRow) {
    // Pausado porque su creador perdió el acceso: reactivarlo lo pasa a tu nombre.
    if (w.status === "paused") {
      setClaiming(w);
      return;
    }
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

  async function handleClaim() {
    if (!claiming) return;
    setBusy(true);
    try {
      await call(
        `/api/configuracion/webhooks/${claiming.id}`,
        { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: true, takeOwnership: true }) },
        "Webhook reactivado a tu nombre"
      );
      setClaiming(null);
      fetchItems();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "No se pudo reactivar");
    } finally {
      setBusy(false);
    }
  }

  // graceHours > 0: el secreto anterior sigue firmando ese tiempo (segunda v1).
  async function handleRotate(graceHours: number) {
    if (!rotating) return;
    setBusy(true);
    try {
      const data = await call(
        `/api/configuracion/webhooks/${rotating.id}/rotate-secret`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ graceHours }) },
        graceHours > 0 ? `Secreto rotado: el anterior sigue firmando ${graceHours} h` : "Secreto rotado"
      );
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
        Un webhook que falla 20 entregas seguidas se desactiva solo y te avisa. Si su creador deja de ser admin, se pausa hasta que otro admin lo reactive.
      </p>

      <EntityList
        rows={items}
        rowKey={(w) => w.id}
        loading={loading}
        error={fetchError}
        onRetry={fetchItems}
        emptyIcon={Webhook}
        emptyTitle="Sin webhooks"
        emptyDescription="Crea uno para enviar los eventos del CRM a tu ERP o a tu propio servidor."
        emptyAction={<Button size="sm" icon={Plus} onClick={openCreate}>Nuevo webhook</Button>}
        rowHref={(w) => `/configuracion/api/webhooks/${w.id}/entregas`}
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
                  {w.status === "paused" && w.pausedReason && <span className="block text-warning">{w.pausedReason}. Actívalo para que quede a tu nombre.</span>}
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
        open={!!claiming}
        onClose={() => setClaiming(null)}
        onConfirm={handleClaim}
        loading={busy}
        tone="warning"
        title={`¿Reactivar “${claiming?.name}” a tu nombre?`}
        description="Su creador ya no es administrador. Al reactivarlo pasa a ser tuyo y enviará los eventos de las cuentas a las que tú tienes acceso."
        confirmLabel="Reactivar y tomar propiedad"
      />
      <Modal
        open={!!rotating}
        onClose={() => setRotating(null)}
        kind="alert"
        title={`¿Rotar el secreto de “${rotating?.name}”?`}
        description="Con 24 h de gracia, cada entrega va firmada con el secreto nuevo y con el actual (dos v1 en X-Colibly-Signature) mientras actualizas tu servidor. Sin gracia, el actual deja de firmar en este momento."
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRotating(null)} disabled={busy}>
              Cancelar
            </Button>
            <Button variant="secondary" onClick={() => handleRotate(0)} disabled={busy}>
              Rotar ya
            </Button>
            <Button onClick={() => handleRotate(24)} loading={busy}>
              Rotar con 24 h de gracia
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-strong">Tu verificador debe aceptar la entrega si cualquiera de las firmas v1 coincide (las recetas de la documentación ya lo hacen).</p>
      </Modal>
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
