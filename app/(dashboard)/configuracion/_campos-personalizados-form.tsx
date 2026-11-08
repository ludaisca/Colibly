"use client";

import { useState, useEffect, useCallback } from "react";
import { Modal } from "@/app/components/ui/modal";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Select } from "@/app/components/ui/select";
import { Textarea } from "@/app/components/ui/textarea";
import { Switch } from "@/app/components/ui/switch";
import { FormField } from "@/app/components/ui/form-field";
import { Banner } from "@/app/components/ui/banner";
import { Spinner } from "@/app/components/ui/spinner";
import { useToast } from "@/app/components/ui/toast";

interface CustomFieldDefinition {
  id: string;
  key: string;
  label: string;
  type: "TEXT" | "NUMBER" | "DATE" | "BOOLEAN" | "SELECT";
  options: string[];
  required: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  accountId: string;
  channel: "WHATSAPP" | "TELEGRAM";
  initialData?: CustomFieldDefinition | null;
  onSaved: () => void;
}

const TYPE_OPTIONS = [
  { value: "TEXT", label: "Texto" },
  { value: "NUMBER", label: "Número" },
  { value: "DATE", label: "Fecha" },
  { value: "BOOLEAN", label: "Sí/No" },
  { value: "SELECT", label: "Lista de opciones" },
];

export function CustomFieldFormModal({ open, onClose, accountId, channel, initialData = null, onSaved }: Props) {
  const isEditing = !!initialData;
  const { success } = useToast();

  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [type, setType] = useState<CustomFieldDefinition["type"]>("TEXT");
  const [optionsText, setOptionsText] = useState("");
  const [required, setRequired] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const resetForm = useCallback(() => {
    setKey(initialData?.key ?? "");
    setLabel(initialData?.label ?? "");
    setType(initialData?.type ?? "TEXT");
    setOptionsText((initialData?.options ?? []).join("\n"));
    setRequired(initialData?.required ?? false);
    setErrors({});
    setError("");
  }, [initialData]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync form fields when the modal opens or the entity being edited changes
    if (open) resetForm();
  }, [open, resetForm]);

  async function handleSubmit() {
    const newErrors: Record<string, string> = {};
    if (!isEditing && !key.trim()) newErrors.key = "Requerida";
    else if (!isEditing && !/^[a-z0-9_]+$/.test(key.trim())) newErrors.key = "Solo minúsculas, números y guion bajo";
    if (!label.trim()) newErrors.label = "Requerido";
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    const options = optionsText.split("\n").map((o) => o.trim()).filter(Boolean);

    setError("");
    setSaving(true);
    try {
      const url = isEditing ? `/api/whatsapp/custom-fields/${initialData!.id}` : "/api/whatsapp/custom-fields";
      const res = await fetch(url, {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isEditing
            ? { label: label.trim(), type, options, required }
            : {
                waAccountId: channel === "WHATSAPP" ? accountId : null,
                channelAccountId: channel === "TELEGRAM" ? accountId : null,
                key: key.trim(),
                label: label.trim(),
                type,
                options,
                required,
              }
        ),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al guardar");

      success(isEditing ? "Campo actualizado" : "Campo creado");
      onClose();
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal layout="drawer"
      open={open}
      onClose={onClose}
      title={isEditing ? "Editar campo" : "Nuevo campo personalizado"}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? <Spinner /> : isEditing ? "Actualizar" : "Crear"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Banner tone="danger">{error}</Banner>}

        <FormField
          label="Clave"
          required
          error={errors.key}
          hint={isEditing ? "No se puede cambiar una vez creado el campo" : "Identificador interno, ej: talla_preferida"}
        >
          {(id) => (
            <Input
              id={id}
              value={key}
              onChange={(e) => setKey(e.target.value.toLowerCase())}
              placeholder="talla_preferida"
              error={errors.key}
              disabled={isEditing}
            />
          )}
        </FormField>

        <FormField label="Nombre a mostrar" required error={errors.label}>
          {(id) => (
            <Input id={id} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Talla preferida" error={errors.label} />
          )}
        </FormField>

        <FormField label="Tipo">
          {(id) => (
            <Select id={id} value={type} onChange={(e) => setType(e.target.value as CustomFieldDefinition["type"])}>
              {TYPE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </Select>
          )}
        </FormField>

        {type === "SELECT" && (
          <FormField label="Opciones" hint="Una por línea">
            {(id) => (
              <Textarea
                id={id}
                value={optionsText}
                onChange={(e) => setOptionsText(e.target.value)}
                rows={4}
                placeholder={"Chica\nMediana\nGrande"}
              />
            )}
          </FormField>
        )}

        <div className="flex items-center justify-between py-1">
          <div>
            <p className="text-sm font-medium text-foreground">Obligatorio</p>
            <p className="text-xs text-muted-darker">Se marca como pendiente en la ficha del contacto si falta</p>
          </div>
          <Switch checked={required} onCheckedChange={setRequired} label="Obligatorio" />
        </div>
      </div>
    </Modal>
  );
}
