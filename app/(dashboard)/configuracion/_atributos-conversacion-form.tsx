"use client";

import { useCallback, useEffect, useState } from "react";
import { Banner } from "@/app/components/ui/banner";
import { Button } from "@/app/components/ui/button";
import { FormField } from "@/app/components/ui/form-field";
import { Input } from "@/app/components/ui/input";
import { Modal } from "@/app/components/ui/modal";
import { Select } from "@/app/components/ui/select";
import { Switch } from "@/app/components/ui/switch";
import { Textarea } from "@/app/components/ui/textarea";
import { useToast } from "@/app/components/ui/toast";

export interface ChatAttribute {
  id: string;
  key: string;
  label: string;
  type: "TEXT" | "NUMBER" | "DATE" | "BOOLEAN" | "SELECT";
  options: string[];
  required: boolean;
}

const TYPES: Array<{ value: ChatAttribute["type"]; label: string }> = [
  { value: "TEXT", label: "Texto" },
  { value: "NUMBER", label: "Número" },
  { value: "DATE", label: "Fecha" },
  { value: "BOOLEAN", label: "Sí/No" },
  { value: "SELECT", label: "Lista de opciones" },
];

export function ChatAttributeFormModal({
  open,
  onClose,
  accountId,
  isWhatsApp,
  initialData,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  accountId: string;
  isWhatsApp: boolean;
  initialData?: ChatAttribute | null;
  onSaved: () => void;
}) {
  const editing = !!initialData;
  const { success } = useToast();
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [type, setType] = useState<ChatAttribute["type"]>("TEXT");
  const [options, setOptions] = useState("");
  const [required, setRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reset = useCallback(() => {
    setKey(initialData?.key ?? "");
    setLabel(initialData?.label ?? "");
    setType(initialData?.type ?? "TEXT");
    setOptions((initialData?.options ?? []).join("\n"));
    setRequired(initialData?.required ?? false);
    setError(null);
  }, [initialData]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza el formulario al abrir/editar
    if (open) reset();
  }, [open, reset]);

  async function save() {
    if (!key.trim() || !/^[a-z0-9_]+$/.test(key.trim())) {
      setError("La clave solo admite minúsculas, números y guion bajo");
      return;
    }
    if (!label.trim()) {
      setError("El nombre es obligatorio");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(editing ? `/api/whatsapp/chat-custom-fields/${initialData!.id}` : "/api/whatsapp/chat-custom-fields", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editing
            ? { label: label.trim(), type, options: options.split("\n").map((o) => o.trim()).filter(Boolean), required }
            : {
                ...(isWhatsApp ? { waAccountId: accountId } : { channelAccountId: accountId }),
                key: key.trim(),
                label: label.trim(),
                type,
                options: options.split("\n").map((o) => o.trim()).filter(Boolean),
                required,
              }
        ),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar");
      success(editing ? "Atributo actualizado" : "Atributo creado");
      onClose();
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal layout="drawer"
      open={open}
      onClose={onClose}
      title={editing ? "Editar atributo" : "Nuevo atributo de conversación"}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => void save()} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Banner tone="danger">{error}</Banner>}
        <FormField label="Clave" hint={editing ? "No se puede cambiar" : "Ej. motivo_contacto"}>
          {(id) => (
            <Input id={id} value={key} onChange={(event) => setKey(event.target.value.toLowerCase())} disabled={editing} placeholder="motivo_contacto" />
          )}
        </FormField>
        <FormField label="Nombre visible">
          {(id) => <Input id={id} value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Motivo de contacto" />}
        </FormField>
        <FormField label="Tipo">
          {(id) => (
            <Select id={id} value={type} onChange={(event) => setType(event.target.value as ChatAttribute["type"])}>
              {TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Select>
          )}
        </FormField>
        {type === "SELECT" && (
          <FormField label="Opciones" hint="Una por línea">
            {(id) => <Textarea id={id} value={options} onChange={(event) => setOptions(event.target.value)} rows={4} placeholder={"Compra\nSoporte\nInformación"} />}
          </FormField>
        )}
        <div className="flex items-center justify-between py-1">
          <div>
            <p className="text-sm font-medium text-foreground">Obligatorio</p>
            <p className="text-xs text-muted-darker">Se muestra como pendiente en el chat si falta</p>
          </div>
          <Switch checked={required} onCheckedChange={setRequired} label="Obligatorio" />
        </div>
      </div>
    </Modal>
  );
}
