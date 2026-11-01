"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/app/components/ui/modal";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Select } from "@/app/components/ui/select";
import { FormField } from "@/app/components/ui/form-field";
import { Banner } from "@/app/components/ui/banner";

interface Definition {
  id: string;
  key: string;
  label: string;
  type: "TEXT" | "NUMBER" | "DATE" | "BOOLEAN" | "SELECT";
  options: string[];
  required: boolean;
}

// F4: al resolver, la API respondió 422 `required_fields`. Pide solo los
// atributos obligatorios que faltan, los guarda (PUT custom-fields, la misma
// ruta de los detalles del chat) y vuelve a intentar resolver.
export function RequiredFieldsModal({
  chatId,
  missingKeys,
  onClose,
  onSavedRetry,
}: {
  chatId: string;
  missingKeys: string[];
  onClose: () => void;
  onSavedRetry: () => Promise<void>;
}) {
  const [definitions, setDefinitions] = useState<Definition[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/whatsapp/chats/${chatId}/custom-fields`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setDefinitions(Array.isArray(data.definitions) ? data.definitions : []);
        setValues(data.values && typeof data.values === "object" ? data.values : {});
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [chatId]);

  const missing = definitions.filter((def) => missingKeys.includes(def.key));
  const complete = missing.every((def) => (values[def.key] ?? "").trim());

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/whatsapp/chats/${chatId}/custom-fields`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "No se pudieron guardar los atributos");
      await onSavedRetry();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron guardar los atributos");
    } finally {
      setSaving(false);
    }
  }

  const set = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  return (
    <Modal
      open
      onClose={onClose}
      title="Completa antes de resolver"
      description="Esta cuenta pide estos datos de la conversación para poder resolverla."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button loading={saving} disabled={!complete || missing.length === 0} onClick={() => void save()}>
            Guardar y resolver
          </Button>
        </>
      }
    >
      {error && <Banner tone="danger" className="mb-3">{error}</Banner>}
      <div className="space-y-3">
        {missing.map((def) => (
          <FormField key={def.id} label={def.label} required>
            {(id) =>
              def.type === "SELECT" || def.type === "BOOLEAN" ? (
                <Select id={id} value={values[def.key] ?? ""} onChange={(e) => set(def.key, e.target.value)}>
                  <option value="">Elige una opción</option>
                  {def.type === "BOOLEAN" ? (
                    <>
                      <option value="true">Sí</option>
                      <option value="false">No</option>
                    </>
                  ) : (
                    def.options.map((option) => <option key={option} value={option}>{option}</option>)
                  )}
                </Select>
              ) : (
                <Input
                  id={id}
                  type={def.type === "NUMBER" ? "number" : def.type === "DATE" ? "date" : "text"}
                  value={values[def.key] ?? ""}
                  onChange={(e) => set(def.key, e.target.value)}
                />
              )
            }
          </FormField>
        ))}
      </div>
    </Modal>
  );
}
