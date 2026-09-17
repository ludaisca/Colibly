"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Modal } from "@/app/components/ui/modal";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Textarea } from "@/app/components/ui/textarea";
import { Select } from "@/app/components/ui/select";
import { FormField } from "@/app/components/ui/form-field";
import { Switch } from "@/app/components/ui/switch";
import { Banner } from "@/app/components/ui/banner";
import { Spinner } from "@/app/components/ui/spinner";
import { useToast } from "@/app/components/ui/toast";
import { STAGE_LABEL, PIPELINE_STAGES } from "@/lib/pipeline/stages";

interface Props {
  open: boolean;
  onClose: () => void;
  editId?: string | null;
  onSaved: () => void;
}

interface StepDraft { delayMinutes: string; message: string }

// Ventana de servicio de Meta para mensajes libres (ver lib/sequences.ts).
const WHATSAPP_WINDOW_MINUTES = 24 * 60;

const TRIGGER_LABEL: Record<string, string> = {
  TAG_ADDED: "Se agrega una etiqueta",
  LEAD_STATUS_CHANGED: "El estado del lead cambia a",
  APPOINTMENT_COMPLETED: "Se completa una cita",
};

export function SequenceFormModal({ open, onClose, editId = null, onSaved }: Props) {
  const isEditing = !!editId;
  const { success, error: toastError } = useToast();

  const [name, setName] = useState("");
  // Un solo id para ambos canales, igual que bots/_form.tsx — el canal se
  // deduce de `accounts` al guardar.
  const [accountId, setAccountId] = useState("");
  const [triggerType, setTriggerType] = useState("TAG_ADDED");
  const [triggerValue, setTriggerValue] = useState("");
  const [exitOnReply, setExitOnReply] = useState(true);
  const [active, setActive] = useState(true);
  const [steps, setSteps] = useState<StepDraft[]>([{ delayMinutes: "0", message: "" }]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string; channel: "WHATSAPP" | "TELEGRAM" }>>([]);
  const [tags, setTags] = useState<Array<{ id: string; name: string }>>([]);

  const resetForm = useCallback(() => {
    setName("");
    setAccountId("");
    setTriggerType("TAG_ADDED");
    setTriggerValue("");
    setExitOnReply(true);
    setActive(true);
    setSteps([{ delayMinutes: "0", message: "" }]);
    setErrors({});
    setError("");
  }, []);

  useEffect(() => {
    if (!open) return;
    Promise.all([
      fetch("/api/whatsapp/accounts").then((r) => r.json()),
      fetch("/api/telegram/accounts").then((r) => r.json()),
    ])
      .then(([wa, tg]) => {
        setAccounts([
          ...(Array.isArray(wa) ? wa.map((a: { id: string; name: string }) => ({ id: a.id, name: a.name, channel: "WHATSAPP" as const })) : []),
          ...(Array.isArray(tg) ? tg.map((a: { id: string; name: string }) => ({ id: a.id, name: a.name, channel: "TELEGRAM" as const })) : []),
        ]);
      })
      .catch(() => toastError("Error al cargar cuentas"));
  }, [open, toastError]);

  // Las etiquetas son por cuenta — el selector del disparador solo ofrece las
  // de la cuenta elegida.
  useEffect(() => {
    const account = accounts.find((a) => a.id === accountId);
    if (!open || !account) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sin cuenta no hay catálogo
      setTags([]);
      return;
    }
    const param = account.channel === "TELEGRAM" ? "channelAccountId" : "waAccountId";
    fetch(`/api/whatsapp/tags?${param}=${account.id}`)
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setTags(d); })
      .catch(() => toastError("Error al cargar etiquetas"));
  }, [open, accountId, accounts, toastError]);

  useEffect(() => {
    if (!open || !editId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load-on-open for edit mode
    setLoading(true);
    fetch(`/api/whatsapp/sequences/${editId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.name) {
          setName(d.name);
          setAccountId(d.waAccountId ?? d.channelAccountId ?? "");
          setTriggerType(d.triggerType);
          setTriggerValue(d.triggerValue ?? "");
          setExitOnReply(d.exitOnReply);
          setActive(d.active);
          setSteps(
            d.steps.length > 0
              ? d.steps.map((s: { delayMinutes: number; message: string }) => ({
                  delayMinutes: String(s.delayMinutes),
                  message: s.message,
                }))
              : [{ delayMinutes: "0", message: "" }]
          );
        }
      })
      .catch(() => toastError("Error al cargar secuencia"))
      .finally(() => setLoading(false));
  }, [open, editId, toastError]);

  function handleClose() {
    resetForm();
    onClose();
  }

  function addStep() {
    setSteps((prev) => [...prev, { delayMinutes: "60", message: "" }]);
  }

  function removeStep(i: number) {
    setSteps((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateStep(i: number, patch: Partial<StepDraft>) {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  async function handleSubmit() {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = "Requerido";
    if (!accountId) newErrors.accountId = "Selecciona una cuenta";
    if (triggerType !== "APPOINTMENT_COMPLETED" && !triggerValue) newErrors.triggerValue = "Requerido";
    if (steps.length === 0) newErrors.steps = "Agrega al menos un paso";
    if (steps.some((s) => !s.message.trim())) newErrors.steps = "Todos los pasos necesitan un mensaje";
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setError("");
    setSaving(true);
    try {
      // Igual que bots/_form.tsx: se manda siempre solo uno de los dos ids —
      // el otro implícitamente null en el body, para que el backend decida.
      const selectedAccount = accounts.find((a) => a.id === accountId);
      const isTelegram = selectedAccount?.channel === "TELEGRAM";
      const payload = {
        name: name.trim(),
        waAccountId: isTelegram ? null : accountId,
        channelAccountId: isTelegram ? accountId : null,
        triggerType,
        triggerValue: triggerType === "APPOINTMENT_COMPLETED" ? null : triggerValue,
        exitOnReply,
        active,
        steps: steps.map((s) => ({ delayMinutes: Number(s.delayMinutes) || 0, message: s.message.trim() })),
      };

      const res = await fetch(
        isEditing ? `/api/whatsapp/sequences/${editId}` : "/api/whatsapp/sequences",
        {
          method: isEditing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al guardar");

      success(isEditing ? "Secuencia actualizada" : "Secuencia creada");
      onSaved();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={isEditing ? "Editar secuencia" : "Nueva secuencia"}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? <Spinner size="sm" /> : isEditing ? "Guardar" : "Crear"}
          </Button>
        </>
      }
    >
      {loading ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : (
        <div className="space-y-4">
          {error && <Banner tone="danger">{error}</Banner>}

          <FormField label="Nombre" error={errors.name}>
            {(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Bienvenida a nuevos leads" />}
          </FormField>

          <FormField label="Cuenta" error={errors.accountId}>
            {(id) => (
              <Select id={id} value={accountId} onChange={(e) => setAccountId(e.target.value)} disabled={isEditing}>
                <option value="">Selecciona una cuenta</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}{a.channel === "TELEGRAM" ? " · Telegram" : ""}
                  </option>
                ))}
              </Select>
            )}
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Se dispara cuando...">
              {(id) => (
                <Select id={id} value={triggerType} onChange={(e) => { setTriggerType(e.target.value); setTriggerValue(""); }}>
                  {Object.entries(TRIGGER_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </Select>
              )}
            </FormField>

            {triggerType === "TAG_ADDED" && (
              <FormField label="Etiqueta" error={errors.triggerValue}>
                {(id) => (
                  <Select id={id} value={triggerValue} onChange={(e) => setTriggerValue(e.target.value)}>
                    <option value="">Selecciona una etiqueta</option>
                    {tags.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </Select>
                )}
              </FormField>
            )}

            {triggerType === "LEAD_STATUS_CHANGED" && (
              <FormField label="Nuevo estado" error={errors.triggerValue}>
                {(id) => (
                  <Select id={id} value={triggerValue} onChange={(e) => setTriggerValue(e.target.value)}>
                    <option value="">Selecciona un estado</option>
                    {PIPELINE_STAGES.map((s) => (
                      <option key={s} value={s}>{STAGE_LABEL[s]}</option>
                    ))}
                  </Select>
                )}
              </FormField>
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium text-foreground">Detener si el contacto responde</p>
              <p className="text-xs text-muted-darker">Evita seguir mandando pasos guionados a alguien ya en conversación activa</p>
            </div>
            <Switch checked={exitOnReply} onCheckedChange={setExitOnReply} />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <p className="text-sm font-medium text-foreground">Activa</p>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">Pasos (en orden)</span>
              <Button type="button" variant="secondary" size="sm" icon={Plus} onClick={addStep}>
                Agregar paso
              </Button>
            </div>
            {errors.steps && <p className="text-xs text-danger">{errors.steps}</p>}
            {accounts.find((a) => a.id === accountId)?.channel === "WHATSAPP" &&
              steps.reduce((total, s) => total + (Number(s.delayMinutes) || 0), 0) > WHATSAPP_WINDOW_MINUTES && (
                <Banner tone="warning">
                  WhatsApp solo permite mensajes libres dentro de las 24 h posteriores al último mensaje del cliente. Los
                  pasos que caigan fuera de esa ventana no se envían:{" "}
                  {exitOnReply
                    ? "con “Detener si el contacto responde” activo, la inscripción se marca como expirada."
                    : "la inscripción espera hasta 7 días a que el cliente vuelva a escribir y luego expira."}
                </Banner>
              )}
            <div className="space-y-3">
              {steps.map((step, i) => (
                <div key={i} className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-darker">Paso {i + 1}</span>
                    {steps.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeStep(i)}
                        className="text-muted-darker hover:text-danger transition-colors p-1 rounded-md hover:bg-surface-light"
                        title="Quitar paso"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      value={step.delayMinutes}
                      onChange={(e) => updateStep(i, { delayMinutes: e.target.value })}
                      className="w-28"
                    />
                    <span className="text-sm text-muted-darker">minutos después de {i === 0 ? "inscribirse" : "el paso anterior"}</span>
                  </div>
                  <Textarea
                    value={step.message}
                    onChange={(e) => updateStep(i, { message: e.target.value })}
                    placeholder="Mensaje a enviar — usa {{nombre}} para el nombre del contacto"
                    rows={2}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
