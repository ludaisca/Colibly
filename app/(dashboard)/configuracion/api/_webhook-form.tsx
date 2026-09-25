"use client";

import { useState } from "react";
import { Modal } from "@/app/components/ui/modal";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Checkbox } from "@/app/components/ui/checkbox";
import { Switch } from "@/app/components/ui/switch";
import { FormField } from "@/app/components/ui/form-field";
import { Banner } from "@/app/components/ui/banner";
import { SecretField } from "@/app/components/integrations/secret-field";
import { DOMAIN_EVENT_CATALOG, type DomainEventType } from "@/lib/events/types";
import { AccountScopeField, splitAccountIds, type IntegrationAccount } from "./_shared";

export interface WebhookRow {
  id: string;
  name: string;
  url: string;
  events: string[];
  accountIds: string[];
  channelAccountIds: string[];
  active: boolean;
  disabledAt: string | null;
  consecutiveFailures: number;
  lastDeliveryAt: string | null;
  createdAt: string;
}

const EVENT_ENTRIES = Object.entries(DOMAIN_EVENT_CATALOG) as [DomainEventType, string][];

// Crear y editar (initialData presente ⇒ edición). Al crear, segundo paso con
// el secreto de firma — se muestra una sola vez, igual que el verify token.
export function WebhookFormModal({
  open,
  onClose,
  onSaved,
  accounts,
  initialData,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  accounts: IntegrationAccount[];
  initialData?: WebhookRow | null;
}) {
  const editing = !!initialData;
  const [name, setName] = useState(initialData?.name ?? "");
  const [url, setUrl] = useState(initialData?.url ?? "");
  const [allEvents, setAllEvents] = useState(initialData ? initialData.events.includes("*") : true);
  const [events, setEvents] = useState<string[]>(initialData?.events.filter((e) => e !== "*") ?? []);
  const [accountIds, setAccountIds] = useState<string[]>(
    initialData ? [...initialData.accountIds, ...initialData.channelAccountIds] : []
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [secret, setSecret] = useState<string | null>(null);

  function handleClose() {
    setSecret(null);
    setError("");
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError("El nombre es requerido");
    if (!url.trim()) return setError("La URL es requerida");
    if (!allEvents && events.length === 0) return setError("Elige al menos un evento");
    setSaving(true);
    try {
      const res = await fetch(editing ? `/api/configuracion/webhooks/${initialData!.id}` : "/api/configuracion/webhooks", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          url: url.trim(),
          events: allEvents ? ["*"] : events,
          ...splitAccountIds(accountIds, accounts),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar el webhook");
      onSaved();
      if (editing) handleClose();
      else setSecret(data.secret);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el webhook");
    } finally {
      setSaving(false);
    }
  }

  if (secret) {
    return (
      <Modal
        open={open}
        onClose={handleClose}
        persistent
        title="Webhook creado"
        description="Guarda el secreto de firma en tu servidor para verificar que cada entrega viene de SundayCRM. No se vuelve a mostrar."
        size="md"
        footer={<Button onClick={handleClose}>Listo, ya lo guardé</Button>}
      >
        <div className="space-y-4">
          <SecretField label="Secreto de firma" value={secret} />
          <p className="text-sm text-muted">
            Cada entrega trae el header <code className="font-mono text-xs">X-Sunday-Signature</code>. La pestaña Documentación
            tiene el código para verificarlo. Usa “Probar” en la lista para mandar un evento de prueba.
          </p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={editing ? "Editar webhook" : "Nuevo webhook"}
      description="SundayCRM hará un POST firmado a tu URL cada vez que ocurra uno de los eventos elegidos."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>Cancelar</Button>
          <Button type="submit" form="webhook-form" loading={saving}>{editing ? "Guardar" : "Crear webhook"}</Button>
        </>
      }
    >
      <form id="webhook-form" onSubmit={handleSubmit} className="space-y-5">
        {error && <Banner tone="danger">{error}</Banner>}
        <FormField label="Nombre" required>
          {(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Sincronizar con ERP" />}
        </FormField>
        <FormField label="URL de destino" required hint="Debe ser https:// y accesible desde internet.">
          {(id) => (
            <Input id={id} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://mi-servidor.com/webhooks/sunday" inputMode="url" />
          )}
        </FormField>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">Todos los eventos</p>
              <p className="text-xs text-muted-darker">Incluye los que se agreguen en el futuro.</p>
            </div>
            <Switch checked={allEvents} onCheckedChange={setAllEvents} label="Todos los eventos" />
          </div>
          {!allEvents && (
            <fieldset className="grid gap-2 sm:grid-cols-2">
              <legend className="sr-only">Eventos</legend>
              {EVENT_ENTRIES.map(([type, label]) => (
                <Checkbox
                  key={type}
                  checked={events.includes(type)}
                  onChange={(checked) => setEvents((prev) => (checked ? [...prev, type] : prev.filter((e) => e !== type)))}
                  label={label}
                  description={type}
                />
              ))}
            </fieldset>
          )}
        </div>

        <AccountScopeField accounts={accounts} value={accountIds} onChange={setAccountIds} />
      </form>
    </Modal>
  );
}
