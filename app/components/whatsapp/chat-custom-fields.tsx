"use client";

import { useCallback, useState } from "react";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Select } from "@/app/components/ui/select";
import { useToast } from "@/app/components/ui/toast";
import { useRunOnChange } from "@/app/components/ui/use-run-on-change";

interface Definition {
  id: string;
  key: string;
  label: string;
  type: "TEXT" | "NUMBER" | "DATE" | "BOOLEAN" | "SELECT";
  options: string[];
  required: boolean;
}

export function ChatCustomFields({ chatId, className }: { chatId: string; className?: string }) {
  const { success, error: toastError } = useToast();
  const [definitions, setDefinitions] = useState<Definition[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/whatsapp/chats/${chatId}/custom-fields`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al cargar atributos");
      setDefinitions(Array.isArray(data.definitions) ? data.definitions : []);
      setValues(data.values && typeof data.values === "object" ? data.values : {});
    } catch {
      setDefinitions([]);
    } finally {
      setLoading(false);
    }
  }, [chatId]);

  useRunOnChange(() => void load(), [load]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/whatsapp/chats/${chatId}/custom-fields`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudieron guardar los atributos");
      success("Atributos guardados");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "No se pudieron guardar los atributos");
    } finally {
      setSaving(false);
    }
  }

  if (loading || definitions.length === 0) return null;

  return (
    <section className={className}>
      <h3 className="text-xs font-semibold text-muted-darker">Atributos de la conversación</h3>
      <div className="mt-2 space-y-2.5">
        {definitions.map((definition) => (
          <div key={definition.id}>
            <label className="mb-1 block text-micro text-muted-darker" htmlFor={`chat-field-${definition.id}`}>
              {definition.label}
              {definition.required && <span className="ml-1 text-danger" aria-hidden="true">*</span>}
            </label>
            {definition.type === "SELECT" ? (
              <Select
                id={`chat-field-${definition.id}`}
                value={values[definition.key] ?? ""}
                onChange={(event) => setValues((prev) => ({ ...prev, [definition.key]: event.target.value }))}
              >
                <option value="">Sin seleccionar</option>
                {definition.options.map((option) => <option key={option} value={option}>{option}</option>)}
              </Select>
            ) : definition.type === "BOOLEAN" ? (
              <Select
                id={`chat-field-${definition.id}`}
                value={values[definition.key] ?? ""}
                onChange={(event) => setValues((prev) => ({ ...prev, [definition.key]: event.target.value }))}
              >
                <option value="">Sin especificar</option>
                <option value="true">Sí</option>
                <option value="false">No</option>
              </Select>
            ) : (
              <Input
                id={`chat-field-${definition.id}`}
                type={definition.type === "NUMBER" ? "number" : definition.type === "DATE" ? "date" : "text"}
                value={values[definition.key] ?? ""}
                onChange={(event) => setValues((prev) => ({ ...prev, [definition.key]: event.target.value }))}
              />
            )}
          </div>
        ))}
        <Button size="sm" variant="secondary" onClick={() => void save()} disabled={saving}>
          {saving ? "Guardando…" : "Guardar atributos"}
        </Button>
      </div>
    </section>
  );
}
