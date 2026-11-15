"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/app/components/ui/modal";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Select } from "@/app/components/ui/select";
import { FormField } from "@/app/components/ui/form-field";
import { useToast } from "@/app/components/ui/toast";
import { normalizeManualPhone } from "@/lib/contacts/manual-phone";

const NAME_MAX = 120;
// El contador aparece cuando faltan 10 caracteres o menos para el límite.
const NAME_COUNTER_FROM = NAME_MAX - 10;

interface AccountOption {
  id: string;
  name: string;
  phoneNumber: string | null;
  channel?: string;
}

interface TagOption {
  id: string;
  name: string;
}

// Alta manual de un contacto (POST /api/whatsapp/contacts). Sin cuentas
// conectadas se crea "sin canal" y se vincula solo al conectar WhatsApp.
export function ContactCreateModal({
  open,
  onClose,
  accounts,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  accounts: AccountOption[];
  onCreated: (contactId: string) => void;
}) {
  const { success, error: toastError } = useToast();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [accountId, setAccountId] = useState("");
  const [tags, setTags] = useState<TagOption[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const effectiveAccountId = accountId || accounts[0]?.id || "";
  const account = accounts.find((a) => a.id === effectiveAccountId);
  // Misma normalización que el servidor (10 dígitos sin + = México).
  const phoneError = phone.trim() && !normalizeManualPhone(phone) ? "El teléfono no es válido. Escríbelo con lada, por ejemplo +52 55 1234 5678." : undefined;
  const blockedReason = !name.trim()
    ? "Escribe el nombre para guardar."
    : !phone.trim()
      ? "Escribe el teléfono para guardar."
      : phoneError
        ? "Corrige el teléfono para guardar."
        : null;

  // Etiquetas del destino: las de la cuenta elegida o, sin canal, las de la organización.
  useEffect(() => {
    if (!open) return;
    const query = account ? `${!account.channel || account.channel === "WHATSAPP" ? "waAccountId" : "channelAccountId"}=${account.id}` : "organization=1";
    let cancelled = false;
    fetch(`/api/whatsapp/tags?${query}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => { if (!cancelled) { setTags(Array.isArray(data) ? data : []); setTagIds([]); } })
      .catch(() => { if (!cancelled) setTags([]); });
    return () => { cancelled = true; };
  }, [open, account]);

  function close() {
    setName("");
    setPhone("");
    setAccountId("");
    setTagIds([]);
    setError(null);
    onClose();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/whatsapp/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, ...(effectiveAccountId ? { accountId: effectiveAccountId } : {}), tagIds }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409 && data.id) {
          setError("Ya tienes un contacto con ese teléfono.");
          return;
        }
        throw new Error(data.error ?? "No se pudo crear el contacto");
      }
      success("Contacto creado");
      onCreated(data.id);
      close();
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo crear el contacto";
      setError(message);
      toastError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Nuevo contacto"
      description={accounts.length === 0 ? "Aún no tienes un canal conectado: el contacto se vinculará a tu WhatsApp cuando lo conectes." : undefined}
      footer={
        <>
          {blockedReason && <p id="contact-create-blocked" className="mr-auto self-center text-xs text-muted-darker">{blockedReason}</p>}
          <Button variant="secondary" onClick={close}>Cancelar</Button>
          <Button type="submit" form="contact-create-form" disabled={saving || !!blockedReason} aria-describedby={blockedReason ? "contact-create-blocked" : undefined}>{saving ? "Guardando…" : "Guardar contacto"}</Button>
        </>
      }
    >
      <form id="contact-create-form" onSubmit={submit} className="space-y-4">
        {error && <p className="rounded-sm bg-danger-bg px-3 py-2 text-xs text-danger">{error}</p>}
        <FormField label="Nombre" required hint={name.length >= NAME_COUNTER_FROM ? `${name.length}/${NAME_MAX}` : undefined}>
          {(id, describedBy) => <Input id={id} aria-describedby={describedBy} value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} placeholder="Mariana López" autoFocus />}
        </FormField>
        <FormField label="Teléfono" required error={phoneError} hint="Con lada, por ejemplo +52 55 1234 5678. Si escribes 10 dígitos asumimos México.">
          {(id, describedBy) => <Input id={id} aria-describedby={describedBy} error={phoneError} inputMode="tel" value={phone} maxLength={40} onChange={(e) => setPhone(e.target.value)} placeholder="+52 55 1234 5678" />}
        </FormField>
        {accounts.length > 1 && (
          <FormField label="Cuenta">
            {(id) => (
              <Select id={id} value={effectiveAccountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            )}
          </FormField>
        )}
        {tags.length > 0 && (
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-foreground">Etiquetas (opcional)</legend>
            <div className="flex flex-wrap gap-2">
              {tags.map((t) => {
                const on = tagIds.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setTagIds((prev) => (on ? prev.filter((x) => x !== t.id) : [...prev, t.id]))}
                    className={`rounded-full border px-3 py-1 text-xs ${on ? "border-accent-strong bg-accent-subtle text-accent-ink" : "border-border text-muted hover:border-accent-strong"}`}
                  >
                    {t.name}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}
      </form>
    </Modal>
  );
}
