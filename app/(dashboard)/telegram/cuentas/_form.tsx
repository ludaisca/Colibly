"use client";

import { useState, useCallback } from "react";
import { Info } from "lucide-react";
import { Modal } from "@/app/components/ui/modal";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { FormField } from "@/app/components/ui/form-field";
import { Banner } from "@/app/components/ui/banner";
import { Spinner } from "@/app/components/ui/spinner";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function TelegramCuentaFormModal({ open, onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [botToken, setBotToken] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState("");

  const resetForm = useCallback(() => {
    setName("");
    setBotToken("");
    setErrors({});
    setApiError("");
  }, []);

  function handleClose() {
    resetForm();
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setApiError("");

    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = "El nombre es requerido";
    if (!botToken.trim()) newErrors.botToken = "El token del bot es requerido";

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setSaving(true);
    try {
      const res = await fetch("/api/telegram/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), botToken: botToken.trim() }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al conectar el bot");

      onCreated();
      handleClose();
    } catch (err) {
      setApiError(err instanceof Error ? err.message : "Error al conectar el bot");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Conectar bot de Telegram"
      description="El webhook se configura automáticamente — no necesitas copiar nada a otro lado."
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? <Spinner /> : "Conectar bot"}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {apiError && <Banner tone="danger">{apiError}</Banner>}

        <FormField label="Nombre de la cuenta" required error={errors.name} hint="Un nombre descriptivo para identificar este bot">
          {(id) => (
            <Input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Soporte Telegram" error={errors.name} />
          )}
        </FormField>

        <FormField label="Token del bot" required error={errors.botToken} hint="Lo obtienes hablando con @BotFather en Telegram">
          {(id) => (
            <Input id={id} value={botToken} onChange={(e) => setBotToken(e.target.value)} placeholder="123456789:AAExampleTokenHere" error={errors.botToken} />
          )}
        </FormField>

        <div className="flex items-start gap-3 p-3 rounded-lg bg-info-bg border border-info-border">
          <Info size={18} className="text-info shrink-0 mt-0.5" />
          <p className="text-sm text-muted-darker">
            En Telegram, escríbele a <strong>@BotFather</strong>, usa <strong>/newbot</strong> y sigue las instrucciones. Al final te dará un token — pégalo aquí tal cual.
          </p>
        </div>
      </form>
    </Modal>
  );
}
