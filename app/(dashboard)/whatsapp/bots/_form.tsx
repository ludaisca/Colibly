"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronDown } from "lucide-react";
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

interface Props {
  open: boolean;
  onClose: () => void;
  editId?: string | null;
  onSaved: () => void;
}

type BotChannel = "WHATSAPP" | "TELEGRAM" | "MESSENGER" | "INSTAGRAM" | "WEBCHAT";
const CHANNEL_LABEL: Record<BotChannel, string> = {
  WHATSAPP: "WhatsApp", TELEGRAM: "Telegram", MESSENGER: "Messenger",
  INSTAGRAM: "Instagram", WEBCHAT: "Chat web",
};

export function BotFormModal({ open, onClose, editId = null, onSaved }: Props) {
  const isEditing = !!editId;
  const { success, error: toastError } = useToast();

  const [name, setName] = useState("");
  // Un solo id para ambos canales — el canal se deduce de `accounts` al
  // guardar, para mandar waAccountId o channelAccountId según corresponda.
  const [accountId, setAccountId] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [temperature, setTemperature] = useState("0.7");
  const [maxTokens, setMaxTokens] = useState("1024");
  const [memoryType, setMemoryType] = useState("RECENT");
  const [memoryLimit, setMemoryLimit] = useState("20");
  const [ragEnabled, setRagEnabled] = useState(false);
  const [humanizeEnabled, setHumanizeEnabled] = useState(false);
  const [appointmentSchedulingEnabled, setAppointmentSchedulingEnabled] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string; channel: BotChannel }>>([]);

  const resetForm = useCallback(() => {
    setName("");
    setAccountId("");
    setSystemPrompt("");
    setTemperature("0.7");
    setMaxTokens("1024");
    setMemoryType("RECENT");
    setMemoryLimit("20");
    setRagEnabled(false);
    setHumanizeEnabled(false);
    setAppointmentSchedulingEnabled(false);
    setErrors({});
    setError("");
  }, []);

  useEffect(() => {
    if (!open) return;
    const channels: BotChannel[] = ["WHATSAPP", "TELEGRAM", "MESSENGER", "INSTAGRAM", "WEBCHAT"];
    Promise.all(channels.map(async (channel) => {
      const res = await fetch(`/api/${channel.toLowerCase()}/accounts`);
      const data = await res.json();
      if (!res.ok || !Array.isArray(data)) throw new Error(data.error ?? "Error al cargar cuentas");
      return data.map((a: { id: string; name: string }) => ({ id: a.id, name: a.name, channel }));
    }))
      .then((lists) => setAccounts(lists.flat()))
      .catch(() => toastError("Error al cargar cuentas"));
  }, [open, toastError]);

  useEffect(() => {
    if (!open || !editId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load-on-open for edit mode
    setLoading(true);
    fetch(`/api/whatsapp/bots/${editId}`)
      .then(async (r) => { if (!r.ok) throw new Error("Error al cargar bot"); return r.json(); })
      .then((d) => {
        if (d.name) {
          setName(d.name);
          setAccountId(d.waAccountId ?? d.channelAccountId ?? "");
          setSystemPrompt(d.systemPrompt);
          setTemperature(String(d.temperature ?? 0.7));
          setMaxTokens(String(d.maxTokens ?? 1024));
          setMemoryType(d.memoryType);
          setMemoryLimit(String(d.memoryLimit ?? 20));
          setRagEnabled(d.ragEnabled);
          setHumanizeEnabled(d.humanizeEnabled ?? false);
          setAppointmentSchedulingEnabled(d.appointmentSchedulingEnabled ?? false);
        }
      })
      .catch(() => toastError("Error al cargar bot"))
      .finally(() => setLoading(false));
  }, [open, editId, toastError]);

  function handleClose() {
    resetForm();
    onClose();
  }

  async function handleSubmit() {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = "Requerido";
    if (!systemPrompt.trim()) newErrors.systemPrompt = "Requerido";
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setError("");
    setSaving(true);
    try {
      // Se mandan siempre ambos campos (uno con valor, el otro null) para que
      // al reasignar el bot de un canal a otro el FK anterior quede limpio.
      // provider/model NO se mandan — la plataforma los asigna sola.
      const selectedAccount = accounts.find((a) => a.id === accountId);
      const body = {
        name: name.trim(),
        waAccountId: selectedAccount?.channel === "WHATSAPP" ? accountId : null,
        channelAccountId: selectedAccount && selectedAccount.channel !== "WHATSAPP" ? accountId : null,
        systemPrompt: systemPrompt.trim(),
        temperature: Number(temperature),
        maxTokens: Number(maxTokens),
        memoryType,
        memoryLimit: Number(memoryLimit),
        ragEnabled,
        humanizeEnabled,
        // Solo tiene efecto en el pipeline de WhatsApp (lib/workers/bot-worker.ts)
        // — se fuerza a false para cualquier otro canal para no dejar un flag
        // encendido que no hace nada y podría confundir después.
        appointmentSchedulingEnabled: selectedAccount?.channel === "WHATSAPP" ? appointmentSchedulingEnabled : false,
      };

      const url = isEditing ? `/api/whatsapp/bots/${editId}` : "/api/whatsapp/bots";
      const res = await fetch(url, {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al guardar");

      success(isEditing ? "Bot actualizado" : "Bot creado exitosamente");
      resetForm();
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
      onClose={handleClose}
      title={isEditing ? "Editar bot" : "Crear bot"}
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving || loading}>
            {saving ? <Spinner /> : isEditing ? "Actualizar" : "Crear bot"}
          </Button>
        </>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center py-16"><Spinner /></div>
      ) : (
        <div className="space-y-5">
          {error && <Banner tone="danger">{error}</Banner>}

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label="Nombre" required error={errors.name}>
              {(id) => (
                <Input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Soporte IA" error={errors.name} />
              )}
            </FormField>
            <FormField label="Cuenta" hint="Opcional — sin cuenta el bot solo se puede usar en la pestaña «Probar», no responderá mensajes reales.">
              {(id) => (
                <Select id={id} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  <option value="">Sin cuenta (solo pruebas)</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {CHANNEL_LABEL[a.channel]}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
          </div>

          <FormField label="Prompt del sistema" required error={errors.systemPrompt} hint="Define cómo se comportará el bot. Incluye instrucciones, tono y límites.">
            {(id) => (
              <Textarea id={id} value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} placeholder="Eres un asistente virtual de soporte técnico…" rows={6} error={errors.systemPrompt} />
            )}
          </FormField>

          <details className="group rounded-lg border border-border">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium">
              Configuración avanzada
              <ChevronDown size={16} className="shrink-0 text-muted-darker transition-transform group-open:rotate-180" />
            </summary>
            <div className="space-y-5 border-t border-border p-4">
              <p className="text-xs text-muted-darker">
                Los valores por defecto funcionan bien para la mayoría de los casos — solo ajusta esto si sabes lo que buscas.
              </p>
              <div className="grid gap-5 sm:grid-cols-2">
                <FormField label="Temperatura" hint="0-2 — más alto = respuestas más variadas. Algunos modelos, como Gemini 3.8, usan su ajuste automático.">
                  {(id) => (
                    <Input id={id} type="number" min="0" max="2" step="0.1" value={temperature} onChange={(e) => setTemperature(e.target.value)} />
                  )}
                </FormField>
                <FormField label="Max tokens" hint="1-8192 — largo máximo de cada respuesta">
                  {(id) => (
                    <Input id={id} type="number" min="1" max="8192" value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)} />
                  )}
                </FormField>
                <FormField label="Límite memoria" hint="Cuántos mensajes recuerda">
                  {(id) => (
                    <Input id={id} type="number" min="1" max="100" value={memoryLimit} onChange={(e) => setMemoryLimit(e.target.value)} />
                  )}
                </FormField>
              </div>
              <FormField label="Tipo de memoria">
                {(id) => (
                  <Select id={id} value={memoryType} onChange={(e) => setMemoryType(e.target.value)}>
                    <option value="NONE">Sin memoria</option>
                    <option value="RECENT">Reciente (últimos mensajes)</option>
                    <option value="SUMMARY">Resumen acumulativo</option>
                  </Select>
                )}
              </FormField>
            </div>
          </details>

          <div className="space-y-4">
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium">Base de conocimiento (RAG)</p>
                <p className="text-xs text-muted-darker">El bot buscará en documentos antes de responder</p>
              </div>
              <Switch checked={ragEnabled} onCheckedChange={setRagEnabled} />
            </div>

            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium">Humanizar respuestas</p>
                <p className="text-xs text-muted-darker">Divide respuestas largas en varios mensajes con un pequeño retraso entre cada uno, para que se sienta menos automático</p>
              </div>
              <Switch checked={humanizeEnabled} onCheckedChange={setHumanizeEnabled} />
            </div>

            {accounts.find((a) => a.id === accountId)?.channel === "WHATSAPP" && (
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium">Agendar citas automáticamente</p>
                  <p className="text-xs text-muted-darker">Cuando el lead confirma fecha y hora en la conversación, el bot crea la cita solo — se avisa al agente asignado, sin pasos manuales. Solo disponible para cuentas de WhatsApp.</p>
                </div>
                <Switch checked={appointmentSchedulingEnabled} onCheckedChange={setAppointmentSchedulingEnabled} />
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
