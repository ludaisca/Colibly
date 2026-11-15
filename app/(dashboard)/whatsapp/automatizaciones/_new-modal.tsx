"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Modal } from "@/app/components/ui/modal";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Select } from "@/app/components/ui/select";
import { FormField } from "@/app/components/ui/form-field";
import { Banner } from "@/app/components/ui/banner";
import { cn } from "@/app/components/ui/cn";
import { AUTOMATION_TEMPLATES } from "@/lib/automations/templates";
import { CHANNEL_LABEL, type AutomationAccount } from "./_shared";

// Nueva automatización: nombre + cuenta + plantilla de la galería. Crea el
// borrador y abre el editor.
export function NewAutomationModal({ open, onClose, initialTemplateId }: { open: boolean; onClose: () => void; initialTemplateId?: string | null }) {
  const router = useRouter();
  const [accounts, setAccounts] = useState<AutomationAccount[]>([]);
  const [name, setName] = useState("");
  const [accountId, setAccountId] = useState("");
  const [templateId, setTemplateId] = useState(initialTemplateId ?? "welcome_menu");
  // Elegida desde una tarjeta del estado vacío (o ?plantilla= en la URL).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza la plantilla preelegida al abrir
    if (open && initialTemplateId) setTemplateId(initialTemplateId);
  }, [open, initialTemplateId]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    fetch("/api/automations/accounts")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok || !Array.isArray(data)) throw new Error(data.error ?? "No se pudieron cargar las cuentas");
        return data as AutomationAccount[];
      })
      .then((d) => {
        setAccounts(d);
        if (d.length === 1) setAccountId(d[0].id);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudieron cargar las cuentas"));
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const account = accounts.find((a) => a.id === accountId);
    if (!name.trim()) return setError("Ponle un nombre");
    if (!account) return setError("Elige la cuenta");
    setSaving(true);
    try {
      const res = await fetch("/api/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          templateId,
          ...(account.channel === "WHATSAPP" ? { waAccountId: account.id } : { channelAccountId: account.id }),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo crear");
      router.push(`/whatsapp/automatizaciones/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear");
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nueva automatización"
      description="Elige una plantilla para empezar; todo se puede cambiar en el editor."
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="new-automation-form" loading={saving} disabled={accounts.length === 0}>Crear y editar</Button>
        </>
      }
    >
      <form id="new-automation-form" onSubmit={handleSubmit} className="space-y-5">
        {error && <Banner tone="danger">{error}</Banner>}
        {accounts.length === 0 && !error && (
          <Banner tone="info" action={<Button href="/whatsapp/cuentas" size="sm">Conectar WhatsApp</Button>}>
            Las automatizaciones responden en un número conectado. Conecta tu WhatsApp (u otro canal del menú) y crea la primera en un minuto. Mientras tanto puedes probar tu bot en <Link href="/whatsapp/bots" className="underline">Bots IA</Link>.
          </Banner>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Nombre" required>
            {(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="Menú de bienvenida" maxLength={120} autoFocus />}
          </FormField>
          <FormField label="Cuenta" required>
            {(id) => (
              <Select id={id} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">Elige una cuenta</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {CHANNEL_LABEL[a.channel]}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-foreground">Empezar desde</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {AUTOMATION_TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTemplateId(t.id)}
                aria-pressed={templateId === t.id}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors",
                  templateId === t.id ? "border-foreground ring-1 ring-foreground" : "border-border hover:bg-surface-light"
                )}
              >
                <p className="text-sm font-medium text-foreground">{t.name}</p>
                <p className="mt-0.5 text-xs text-muted">{t.description}</p>
              </button>
            ))}
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
