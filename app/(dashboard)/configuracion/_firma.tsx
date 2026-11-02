"use client";

import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { Card } from "@/app/components/ui/card";
import { SectionHeader } from "@/app/components/ui/section-header";
import { Switch } from "@/app/components/ui/switch";
import { FormField } from "@/app/components/ui/form-field";
import { Input } from "@/app/components/ui/input";
import { Button } from "@/app/components/ui/button";
import { useToast } from "@/app/components/ui/toast";
import { SIGNATURE_MAX_LENGTH, appendSignature } from "@/lib/inbox/signature";

// Firma personal (F6): se agrega a los mensajes de texto que mandas a mano
// desde la bandeja. Nunca a plantillas, botones ni archivos.
export function FirmaSection() {
  const { success, error: toastError } = useToast();
  const [enabled, setEnabled] = useState(false);
  const [signature, setSignature] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/auth/profile")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        setEnabled(!!data.signatureEnabled);
        setSignature(data.messageSignature ?? "");
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signatureEnabled: enabled && !!signature.trim(), messageSignature: signature.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar la firma");
      setEnabled(!!data.signatureEnabled);
      success("Firma guardada");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "No se pudo guardar la firma");
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return null;
  return (
    <Card as="section" className="space-y-4">
      <SectionHeader title="Firma en los mensajes" />
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-darker">
          Se agrega en un renglón aparte al final de los mensajes de texto que mandas desde la bandeja. No se agrega a plantillas,
          botones ni archivos.
        </p>
        <Switch checked={enabled} onCheckedChange={setEnabled} label="Usar firma" />
      </div>
      {enabled && (
        <>
          <FormField label="Firma" hint={`Máximo ${SIGNATURE_MAX_LENGTH} caracteres`}>
            {(id) => <Input id={id} value={signature} maxLength={SIGNATURE_MAX_LENGTH} onChange={(e) => setSignature(e.target.value)} placeholder="— Ana, Ventas" />}
          </FormField>
          {signature.trim() && (
            <div className="rounded-lg bg-surface-light p-3">
              <p className="mb-1 text-eyebrow uppercase text-muted-darker">Así se verá</p>
              <p className="whitespace-pre-wrap text-sm text-foreground">{appendSignature("¡Hola! Te comparto la cotización.", signature, true, 4096)}</p>
            </div>
          )}
        </>
      )}
      <Button size="sm" variant="secondary" icon={Save} loading={saving} onClick={save} disabled={enabled && !signature.trim()}>
        Guardar firma
      </Button>
    </Card>
  );
}
