"use client";

import { useState, useEffect, useCallback } from "react";
import { Modal } from "@/app/components/ui/modal";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Textarea } from "@/app/components/ui/textarea";
import { Select } from "@/app/components/ui/select";
import { FormField } from "@/app/components/ui/form-field";
import { Switch } from "@/app/components/ui/switch";
import { Banner } from "@/app/components/ui/banner";
import { Spinner } from "@/app/components/ui/spinner";
import { MultiSelect } from "@/app/components/ui/multi-select";
import { useToast } from "@/app/components/ui/toast";
import { LEAD_SCORER_SCHEDULE_INTERVALS } from "@/lib/validations";

interface AccountOption { id: string; name: string; channel: "WHATSAPP" | "TELEGRAM"; }

const INTERVAL_LABEL: Record<number, string> = {
  15: "Cada 15 minutos",
  30: "Cada 30 minutos",
  60: "Cada hora",
  180: "Cada 3 horas",
  360: "Cada 6 horas",
  720: "Cada 12 horas",
  1440: "Cada 24 horas",
};

interface Props {
  open: boolean;
  onClose: () => void;
  editId?: string | null;
  onSaved: () => void;
}

export function LeadScorerFormModal({ open, onClose, editId = null, onSaved }: Props) {
  const isEditing = !!editId;
  const { success, error: toastError } = useToast();

  const [name, setName] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleIntervalMinutes, setScheduleIntervalMinutes] = useState(30);
  // Selección combinada (WhatsApp + Telegram) mostrada en un solo MultiSelect —
  // se separa en scheduleAccountIds/scheduleChannelAccountIds recién al guardar.
  const [scheduleScopeIds, setScheduleScopeIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);

  const resetForm = useCallback(() => {
    setName("");
    setSystemPrompt("");
    setIsActive(true);
    setScheduleEnabled(false);
    setScheduleIntervalMinutes(30);
    setScheduleScopeIds([]);
    setErrors({});
    setError("");
  }, []);

  useEffect(() => {
    if (!open) return;
    Promise.all([
      fetch("/api/whatsapp/accounts").then(async (r) => { if (!r.ok) throw new Error(); return r.json(); }),
      fetch("/api/telegram/accounts").then(async (r) => { if (!r.ok) throw new Error(); return r.json(); }),
    ])
      .then(([wa, tg]) => {
        setAccounts([
          ...(Array.isArray(wa) ? wa.map((a) => ({ id: a.id, name: a.name, channel: "WHATSAPP" as const })) : []),
          ...(Array.isArray(tg) ? tg.map((a) => ({ id: a.id, name: a.name, channel: "TELEGRAM" as const })) : []),
        ]);
      })
      .catch(() => { setError("Error al cargar cuentas"); toastError("Error al cargar cuentas"); });
  }, [open, toastError]);

  useEffect(() => {
    if (!open || !editId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load-on-open for edit mode
    setLoading(true);
    fetch(`/api/whatsapp/lead-scorers/${editId}`)
      .then(async (r) => { if (!r.ok) throw new Error("Error al cargar el calificador"); return r.json(); })
      .then((d) => {
        if (d.name) {
          setName(d.name);
          setSystemPrompt(d.systemPrompt);
          setIsActive(d.isActive);
          setScheduleEnabled(d.scheduleEnabled ?? false);
          setScheduleIntervalMinutes(d.scheduleIntervalMinutes ?? 30);
          setScheduleScopeIds([...(d.scheduleAccountIds ?? []), ...(d.scheduleChannelAccountIds ?? [])]);
        }
      })
      .catch(() => { setError("Error al cargar el calificador"); toastError("Error al cargar el calificador"); })
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
      const scopeSet = new Set(scheduleScopeIds);
      const scheduleAccountIds = accounts.filter((a) => a.channel === "WHATSAPP" && scopeSet.has(a.id)).map((a) => a.id);
      const scheduleChannelAccountIds = accounts.filter((a) => a.channel === "TELEGRAM" && scopeSet.has(a.id)).map((a) => a.id);

      // provider/model NO se mandan — la plataforma los asigna sola.
      const body = {
        name: name.trim(),
        systemPrompt: systemPrompt.trim(),
        isActive,
        scheduleEnabled,
        scheduleIntervalMinutes: scheduleEnabled ? scheduleIntervalMinutes : null,
        scheduleAccountIds: scheduleEnabled ? scheduleAccountIds : [],
        scheduleChannelAccountIds: scheduleEnabled ? scheduleChannelAccountIds : [],
      };

      const url = isEditing ? `/api/whatsapp/lead-scorers/${editId}` : "/api/whatsapp/lead-scorers";
      const res = await fetch(url, {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al guardar");

      success(isEditing ? "Calificador actualizado" : "Calificador creado exitosamente");
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
      title={isEditing ? "Editar calificador" : "Crear calificador"}
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving || loading}>
            {saving ? <Spinner /> : isEditing ? "Actualizar" : "Crear calificador"}
          </Button>
        </>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center py-16"><Spinner /></div>
      ) : (
        <div className="space-y-5">
          {error && <Banner tone="danger">{error}</Banner>}

          <FormField label="Nombre" required error={errors.name}>
            {(id) => (
              <Input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Calificador bienes raíces" error={errors.name} />
            )}
          </FormField>

          <FormField
            label="Instrucciones de calificación"
            required
            error={errors.systemPrompt}
            hint="Escribe libremente cómo debe analizar las conversaciones: qué buscar, qué cuenta como interés/urgencia/presupuesto para tu negocio. la IA siempre responde en un formato fijo (puntaje, etiqueta, resumen y motivos), así que no necesitas especificar el formato de salida."
          >
            {(id) => (
              <Textarea id={id} value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} placeholder="Eres un analista de ventas de [tu negocio]. Evalúa qué tan calificado está el lead considerando…" rows={8} error={errors.systemPrompt} />
            )}
          </FormField>

          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium">Activo</p>
              <p className="text-xs text-muted-darker">Solo los calificadores activos aparecen para elegir al calificar un chat.</p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} label="Activo" />
          </div>

          <div className="space-y-3 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Ejecución automática</p>
                <p className="text-xs text-muted-darker">
                  Vuelve a calificar los chats abiertos/pendientes con mensajes nuevos, de forma periódica, sin intervención manual.
                </p>
              </div>
              <Switch checked={scheduleEnabled} onCheckedChange={setScheduleEnabled} label="Ejecución automática" />
            </div>
            {scheduleEnabled && (
              <>
                <FormField label="Frecuencia" required error={errors.scheduleIntervalMinutes}>
                  {(id) => (
                    <Select
                      id={id}
                      value={String(scheduleIntervalMinutes)}
                      onChange={(e) => setScheduleIntervalMinutes(Number(e.target.value))}
                    >
                      {LEAD_SCORER_SCHEDULE_INTERVALS.map((m) => (
                        <option key={m} value={m}>{INTERVAL_LABEL[m]}</option>
                      ))}
                    </Select>
                  )}
                </FormField>
                <FormField
                  label="Cuentas a calificar"
                  hint="Deja vacío para calificar automáticamente en todas tus cuentas (WhatsApp y Telegram). Selecciona una o varias para limitar el barrido a solo esas."
                >
                  {(id) => (
                    <MultiSelect
                      id={id}
                      options={accounts.map((a) => ({
                        value: a.id,
                        label: `${a.name} (${a.channel === "TELEGRAM" ? "Telegram" : "WhatsApp"})`,
                      }))}
                      value={scheduleScopeIds}
                      onChange={setScheduleScopeIds}
                      placeholder="Todas las cuentas"
                    />
                  )}
                </FormField>
              </>
            )}
            <p className="text-micro text-muted-darker">
              Cada calificación usa un crédito de IA de tu plan: si se acaban, las ejecuciones automáticas se omiten hasta el siguiente periodo.
            </p>
          </div>
        </div>
      )}
    </Modal>
  );
}
