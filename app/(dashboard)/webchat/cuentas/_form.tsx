"use client";

import { useState, useEffect, useCallback } from "react";
import { Copy, Check } from "lucide-react";
import { Modal } from "@/app/components/ui/modal";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Textarea } from "@/app/components/ui/textarea";
import { FormField } from "@/app/components/ui/form-field";
import { Banner } from "@/app/components/ui/banner";
import { Spinner } from "@/app/components/ui/spinner";
import { useToast } from "@/app/components/ui/toast";

interface Props {
  open: boolean;
  onClose: () => void;
  editId?: string | null;
  onSaved: () => void;
}

// Roadmap P3-f — mismo patrón de dos pasos que whatsapp/cuentas/_form.tsx
// (crear → mostrar el snippet a copiar), pero aquí el "paso 2" también se
// muestra al reabrir una cuenta ya existente (a diferencia del verifyToken
// de WhatsApp, el snippet no es un secreto de un solo uso — el accountId ya
// es público por diseño).
export function WebchatCuentaFormModal({ open, onClose, editId = null, onSaved }: Props) {
  const isEditing = !!editId;
  const { success, error: toastError } = useToast();

  const [name, setName] = useState("");
  const [originsText, setOriginsText] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [createdAccountId, setCreatedAccountId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const resetForm = useCallback(() => {
    setName("");
    setOriginsText("");
    setErrors({});
    setApiError("");
    setCreatedAccountId(null);
    setCopied(false);
  }, []);

  useEffect(() => {
    if (!open || !editId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load-on-open for edit mode
    setLoading(true);
    fetch(`/api/webchat/accounts/${editId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.name) {
          setName(d.name);
          setOriginsText((d.allowedOrigins ?? []).join("\n"));
        }
      })
      .catch(() => toastError("Error al cargar la cuenta"))
      .finally(() => setLoading(false));
  }, [open, editId, toastError]);

  function handleClose() {
    resetForm();
    onClose();
  }

  function parseOrigins(): string[] {
    return originsText.split("\n").map((s) => s.trim()).filter(Boolean);
  }

  async function handleSubmit() {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = "Requerido";
    const allowedOrigins = parseOrigins();
    if (allowedOrigins.length === 0) newErrors.originsText = "Agrega al menos un dominio";
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setApiError("");
    setSaving(true);
    try {
      const res = await fetch(
        isEditing ? `/api/webchat/accounts/${editId}` : "/api/webchat/accounts",
        {
          method: isEditing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), allowedOrigins }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al guardar");

      success(isEditing ? "Cuenta actualizada" : "Cuenta creada");
      onSaved();
      setCreatedAccountId(isEditing ? editId : data.id);
    } catch (err) {
      setApiError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  const snippetAccountId = createdAccountId ?? editId;
  const snippet = snippetAccountId
    ? `<script src="${typeof window !== "undefined" ? window.location.origin : ""}/api/webchat/${snippetAccountId}/widget.js" async></script>`
    : "";

  function copySnippet() {
    navigator.clipboard.writeText(snippet).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // Tras crear (o al reabrir una ya existente), se muestra el snippet en vez
  // del formulario — mismo motivo que whatsapp/cuentas/_form.tsx: lo que el
  // usuario necesita hacer con esto (pegarlo en su sitio) importa más que
  // seguir viendo el formulario de creación.
  const showSnippet = !!snippetAccountId;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={showSnippet ? "Snippet del widget" : isEditing ? "Editar cuenta" : "Nueva cuenta web"}
      size="md"
      footer={
        showSnippet ? (
          <Button onClick={handleClose}>Listo</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={handleClose} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? <Spinner size="sm" /> : isEditing ? "Guardar" : "Crear"}
            </Button>
          </>
        )
      }
    >
      {loading ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : showSnippet ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Copia este script y pégalo antes de <code>&lt;/body&gt;</code> en tu sitio web. Solo funcionará desde los dominios que autorizaste.
          </p>
          <div className="relative">
            <pre className="rounded-lg bg-surface-light border border-border p-3 text-xs overflow-x-auto">{snippet}</pre>
            <Button
              variant="secondary"
              size="sm"
              icon={copied ? Check : Copy}
              onClick={copySnippet}
              className="absolute top-2 right-2"
            >
              {copied ? "Copiado" : "Copiar"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {apiError && <Banner tone="danger">{apiError}</Banner>}

          <FormField label="Nombre" error={errors.name}>
            {(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Sitio principal" />}
          </FormField>

          <FormField
            label="Dominios permitidos"
            error={errors.originsText}
            hint="Uno por línea, con protocolo y sin slash final (ej. https://miempresa.com)"
          >
            {(id) => (
              <Textarea
                id={id}
                value={originsText}
                onChange={(e) => setOriginsText(e.target.value)}
                placeholder="https://miempresa.com"
                rows={4}
              />
            )}
          </FormField>
        </div>
      )}
    </Modal>
  );
}
