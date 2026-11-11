"use client";

import type { MonitorPreset } from "@/lib/onboarding/starter-templates";
import { useState } from "react";
import { Modal } from "@/app/components/ui/modal";
import { Button } from "@/app/components/ui/button";
import { FormField } from "@/app/components/ui/form-field";
import { Input } from "@/app/components/ui/input";
import { Textarea } from "@/app/components/ui/textarea";
import { Banner } from "@/app/components/ui/banner";
import { MONITOR_DESCRIPTION_MAX } from "@/lib/monitors/rules";

export interface MonitorData {
  id: string;
  name: string;
  description: string;
  active: boolean;
  matchCount: number;
}

// Crear / editar un monitor. Se monta con `key` para reiniciar el estado.
export function MonitorFormModal({ initial, preset = null, onClose, onSaved }: { initial: MonitorData | null; preset?: MonitorPreset | null; onClose: () => void; onSaved: () => void }) {
  // Con plantilla (estado vacío) se prellena un monitor nuevo; todo se puede editar.
  const [name, setName] = useState(initial?.name ?? preset?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? preset?.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(initial ? `/api/monitors/${initial.id}` : "/api/monitors", {
        method: initial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? "Editar monitor" : "Nuevo monitor"}
      description="Describe el tema como se lo explicarías a una persona. Cada conversación revisada usa 1 crédito de IA, sin importar cuántos monitores tengas."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button loading={saving} disabled={!name.trim() || description.trim().length < 10} onClick={() => void save()}>Guardar</Button>
        </>
      }
    >
      {error && <Banner tone="danger" className="mb-3">{error}</Banner>}
      <div className="space-y-3">
        <FormField label="Nombre" required>
          {(id) => <Input id={id} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Quejas por entrega tardía" />}
        </FormField>
        <FormField label="Qué buscar" required hint={`Máximo ${MONITOR_DESCRIPTION_MAX} caracteres`}>
          {(id) => (
            <Textarea
              id={id}
              rows={4}
              maxLength={MONITOR_DESCRIPTION_MAX}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="El cliente se queja de que su pedido llegó tarde o no ha llegado en la fecha prometida."
            />
          )}
        </FormField>
      </div>
    </Modal>
  );
}
