"use client";

import { useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { FormField } from "@/app/components/ui/form-field";
import { SectionHeader } from "@/app/components/ui/section-header";
import { Switch } from "@/app/components/ui/switch";
import { Textarea } from "@/app/components/ui/textarea";
import { useToast } from "@/app/components/ui/toast";

const MAX = 1024;

// Mensaje de bienvenida (lib/whatsapp/welcome.ts): se activa también en Meta,
// así que se guarda con el botón (no al mover el interruptor) para no llamar a
// Meta en cada clic.
export function BienvenidaSection({ accountId, enabled: initialEnabled, text: initialText }: { accountId: string; enabled: boolean; text: string | null }) {
  const { success, error: toastError } = useToast();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [text, setText] = useState(initialText ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState({ enabled: initialEnabled, text: initialText ?? "" });
  const dirty = enabled !== saved.enabled || text.trim() !== saved.text;

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/whatsapp/accounts/${accountId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ welcomeMessage: { enabled, text: text.trim() || null } }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar el mensaje de bienvenida");
      setSaved({ enabled: data.welcomeMessageEnabled ?? enabled, text: data.welcomeMessageText ?? "" });
      success(enabled ? "Mensaje de bienvenida activado" : "Mensaje de bienvenida desactivado");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "No se pudo guardar el mensaje de bienvenida");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4">
      <SectionHeader title="Mensaje de bienvenida" />
      <div className="flex items-center justify-between gap-3 py-1">
        <div>
          <p className="text-sm font-medium text-foreground">Saludar a quien abre el chat por primera vez</p>
          <p className="text-xs text-muted-darker">
            WhatsApp avisa cuando alguien abre el chat con este número sin haber escrito nunca, y Colibly le contesta con este texto. Solo la
            primera vez de cada persona, y nunca si alguien de tu equipo, el bot o la API ya le escribió. WhatsApp puede tardar en aplicar el cambio.
          </p>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} label="Mensaje de bienvenida" />
      </div>
      {enabled && (
        <FormField label="Mensaje" hint={`Máximo ${MAX} caracteres. Sin texto, solo se registra en el chat y llega el evento a tus webhooks.`}>
          {(id) => (
            <Textarea id={id} rows={3} maxLength={MAX} value={text} onChange={(e) => setText(e.target.value)} placeholder="¡Hola! Gracias por escribirnos. Cuéntanos en qué te ayudamos." />
          )}
        </FormField>
      )}
      <Button size="sm" variant="secondary" icon={Save} loading={saving} disabled={!dirty} onClick={handleSave}>
        Guardar mensaje de bienvenida
      </Button>
    </section>
  );
}
