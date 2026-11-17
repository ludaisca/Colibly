"use client";

import { displayName } from "@/lib/chats/display-name";
import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { Search, X } from "lucide-react";
import { Modal } from "@/app/components/ui/modal";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { DatePicker } from "@/app/components/ui/date-picker";
import { TimeSelect } from "@/app/components/ui/time-select";
import { localISODaysAgo } from "@/lib/format/calendar";
import { Select } from "@/app/components/ui/select";
import { Textarea } from "@/app/components/ui/textarea";
import { FormField } from "@/app/components/ui/form-field";
import { Banner } from "@/app/components/ui/banner";
import { ConfirmDialog } from "@/app/components/ui/confirm-dialog";
import { useToast } from "@/app/components/ui/toast";

export interface AppointmentDetail {
  id: string;
  title: string;
  notes: string | null;
  scheduledAt: string;
  durationMinutes: number;
  reminderMinutesBefore: number;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  source: "MANUAL" | "AI_BOT";
  cancelReason: string | null;
  contact: { id: string; name: string | null; realName: string | null; remoteJid: string; isSample?: boolean; channelAccount?: { channel: "TELEGRAM" | "MESSENGER" | "INSTAGRAM" | "WEBCHAT" | "WHATSAPP_WEB" } | null };
  assignedTo: { id: string; name: string | null; email: string } | null;
}

interface ContactOption {
  id: string;
  name: string | null;
  realName: string | null;
  remoteJid: string;
}

interface AssigneeOption {
  id: string;
  name: string | null;
  email: string;
}

const STATUS_OPTIONS = [
  { value: "SCHEDULED", label: "Agendada" },
  { value: "COMPLETED", label: "Completada" },
  { value: "CANCELLED", label: "Cancelada" },
  { value: "NO_SHOW", label: "No se presentó" },
];

const REMINDER_OPTIONS = [
  { value: 15, label: "15 minutos antes" },
  { value: 30, label: "30 minutos antes" },
  { value: 60, label: "1 hora antes" },
  { value: 180, label: "3 horas antes" },
  { value: 1440, label: "1 día antes" },
];

function contactLabelOf(c: { name: string | null; realName: string | null; remoteJid: string }): string {
  return c.realName ?? displayName(c.name, c.remoteJid);
}

function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  // Presente cuando se abre desde ContactDrawer: el contacto ya se conoce,
  // no hace falta el buscador.
  contactId?: string;
  contactLabel?: string;
  // Presente en modo edición.
  initialData?: AppointmentDetail;
}

export function AppointmentFormModal({ open, onClose, onSaved, contactId, contactLabel, initialData }: Props) {
  const { success, error: toastError } = useToast();
  const { data: session } = useSession();
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const isEdit = !!initialData;
  const lockedContact = contactId ?? initialData?.contact.id ?? null;

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [assignedToId, setAssignedToId] = useState("");
  const [reminderMinutesBefore, setReminderMinutesBefore] = useState(60);
  const [status, setStatus] = useState<AppointmentDetail["status"]>("SCHEDULED");
  const [cancelReason, setCancelReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function deleteAppointment() {
    if (!initialData) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/whatsapp/appointments/${initialData.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "No se pudo eliminar la cita");
      success("Cita eliminada");
      setConfirmDelete(false);
      onSaved();
      onClose();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "No se pudo eliminar la cita");
    } finally {
      setSaving(false);
    }
  }
  const [error, setError] = useState("");

  const [selectedContact, setSelectedContact] = useState<ContactOption | null>(null);
  const [contactSearch, setContactSearch] = useState("");
  const [contactResults, setContactResults] = useState<ContactOption[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [assignees, setAssignees] = useState<AssigneeOption[]>([]);

  const resetForm = useCallback(() => {
    if (initialData) {
      setTitle(initialData.title);
      setNotes(initialData.notes ?? "");
      setScheduledAt(isoToLocalInput(initialData.scheduledAt));
      setDurationMinutes(initialData.durationMinutes);
      setAssignedToId(initialData.assignedTo?.id ?? "");
      setReminderMinutesBefore(initialData.reminderMinutesBefore);
      setStatus(initialData.status);
      setCancelReason(initialData.cancelReason ?? "");
      setSelectedContact(null);
    } else {
      setTitle("");
      setNotes("");
      setScheduledAt("");
      setDurationMinutes(30);
      setAssignedToId("");
      setReminderMinutesBefore(60);
      setStatus("SCHEDULED");
      setCancelReason("");
      setSelectedContact(null);
    }
    setContactSearch("");
    setContactResults([]);
    setShowResults(false);
    setError("");
  }, [initialData]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- form reset on open, not a data fetch
    if (open) resetForm();
  }, [open, resetForm]);

  // Elegibles para "Asignar a" — depende de qué contacto quedó fijo
  // (prop, edición, o el que se acaba de elegir en el buscador). No hay un
  // early-return que limpie `assignees` a mano (eso dispararía
  // react-hooks/set-state-in-effect, setState síncrono en el cuerpo del
  // efecto) — en su lugar el <Select> de más abajo solo lee `assignees`
  // cuando effectiveContactId existe, así que una lista vieja nunca queda
  // visible aunque el estado no se limpie explícitamente.
  const effectiveContactId = lockedContact ?? selectedContact?.id ?? null;
  useEffect(() => {
    if (!open || !effectiveContactId) return;
    fetch(`/api/whatsapp/contacts/${effectiveContactId}/assignees`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => Array.isArray(data) && setAssignees(data))
      .catch(() => toastError("No se pudieron cargar los usuarios asignables"));
  }, [open, effectiveContactId, toastError]);

  // Buscador de contacto (solo cuando no hay uno fijo) — debounced, contra
  // un endpoint acotado propio de Citas (ver contacts-search/route.ts), no
  // GET /api/whatsapp/contacts (403 para el rol "user"). Mismo criterio que
  // arriba: sin limpiar `contactResults` a mano en el early-return — el
  // render de abajo solo muestra resultados cuando el término de búsqueda no
  // está vacío.
  useEffect(() => {
    if (lockedContact || !open) return;
    const term = contactSearch.trim();
    if (!term) return;
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/whatsapp/appointments/contacts-search?q=${encodeURIComponent(term)}`);
        const data = await res.json();
        if (Array.isArray(data)) setContactResults(data);
      } catch {
        // silencioso — el usuario puede reintentar escribiendo
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [contactSearch, lockedContact, open]);

  useEffect(() => {
    if (!showResults) return;
    function handler(e: MouseEvent) {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showResults]);

  async function handleSubmit() {
    setError("");
    if (!effectiveContactId) {
      setError("Selecciona un contacto");
      return;
    }
    if (!title.trim()) {
      setError("El título es requerido");
      return;
    }
    if (!scheduledAt) {
      setError("La fecha y hora son requeridas");
      return;
    }

    setSaving(true);
    try {
      // "" ("Yo" en el picker) se resuelve al id de la sesión aquí, no en el
      // servidor — en el PATCH un `assignedToId: null` explícito desasigna la
      // cita de verdad, no significa "asignar a quien edita" (eso solo aplica
      // como default en el POST de creación).
      const payload: Record<string, unknown> = {
        title: title.trim(),
        notes: notes.trim() || null,
        scheduledAt: new Date(scheduledAt).toISOString(),
        durationMinutes,
        assignedToId: assignedToId || session?.user?.id || null,
        reminderMinutesBefore,
      };

      let res: Response;
      if (isEdit) {
        if (status !== initialData!.status) {
          payload.status = status;
          if (status === "CANCELLED") payload.cancelReason = cancelReason.trim() || null;
        }
        res = await fetch(`/api/whatsapp/appointments/${initialData!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        payload.contactId = effectiveContactId;
        res = await fetch("/api/whatsapp/appointments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al guardar la cita");

      success(isEdit ? "Cita actualizada" : "Cita agendada");
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar la cita");
    } finally {
      setSaving(false);
    }
  }

  const displayedContactLabel =
    contactLabel ??
    (initialData ? contactLabelOf(initialData.contact) : null) ??
    (selectedContact ? contactLabelOf(selectedContact) : null);

  return (
    <>
    <Modal layout="drawer"
      open={open}
      onClose={onClose}
      title={isEdit ? "Editar cita" : "Agendar cita"}
      size="md"
      footer={
        <>
          {/* Solo las citas canceladas se eliminan (la API responde 409 a las demás). */}
          {isEdit && initialData?.status === "CANCELLED" && (
            <Button variant="link-danger" size="sm" className="mr-auto" disabled={saving} onClick={() => setConfirmDelete(true)}>Eliminar</Button>
          )}
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Guardando…" : isEdit ? "Guardar cambios" : "Agendar"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Banner tone="danger">{error}</Banner>}

        {lockedContact ? (
          <div className="rounded-lg border border-border bg-surface-light px-3.5 py-2.5 text-sm text-foreground">
            Contacto: <span className="font-medium">{displayedContactLabel}</span>
          </div>
        ) : (
          <FormField label="Contacto" required>
            {(id) => (
              <div ref={searchBoxRef} className="relative">
                {selectedContact ? (
                  <div className="flex items-center justify-between rounded-lg border border-border bg-surface-light px-3.5 py-2.5 text-sm">
                    <span className="text-foreground font-medium">{contactLabelOf(selectedContact)}</span>
                    <Button type="button" variant="ghost" size="icon" icon={X} className="-my-1.5" onClick={() => { setSelectedContact(null); setContactSearch(""); }} aria-label="Quitar contacto" />
                  </div>
                ) : (
                  <>
                    <Input
                      id={id}
                      icon={Search}
                      value={contactSearch}
                      onChange={(e) => { setContactSearch(e.target.value); setShowResults(true); }}
                      onFocus={() => setShowResults(true)}
                      placeholder="Buscar por nombre o teléfono…"
                    />
                    {showResults && contactSearch.trim() && contactResults.length > 0 && (
                      <div className="absolute z-10 mt-1.5 w-full rounded-lg border border-border bg-surface shadow-lg max-h-56 overflow-y-auto">
                        {contactResults.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => { setSelectedContact(c); setShowResults(false); }}
                            className="w-full text-left px-3.5 py-2 text-sm hover:bg-surface-light transition-colors"
                          >
                            <p className="text-foreground font-medium">{contactLabelOf(c)}</p>
                            <p className="text-xs text-muted-darker">{c.remoteJid}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </FormField>
        )}

        <FormField label="Título" required>
          {(id) => (
            <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. Consulta de valoración" />
          )}
        </FormField>

        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Fecha y hora" required className="sm:col-span-2">
            {(id) => (
              // `scheduledAt` sigue siendo "AAAA-MM-DDTHH:MM" local: fecha y hora
              // se eligen por separado con el calendario y la lista de horas.
              <div className="grid grid-cols-[minmax(0,1fr)_7.5rem] gap-2">
                <DatePicker
                  id={id}
                  ariaLabel="Fecha de la cita"
                  value={scheduledAt.slice(0, 10)}
                  min={localISODaysAgo()}
                  onChange={(date) => setScheduledAt(date ? `${date}T${scheduledAt.slice(11, 16) || "09:00"}` : "")}
                />
                <TimeSelect
                  ariaLabel="Hora de la cita"
                  value={scheduledAt.slice(11, 16)}
                  onChange={(time) => setScheduledAt(`${scheduledAt.slice(0, 10) || localISODaysAgo()}T${time}`)}
                />
              </div>
            )}
          </FormField>
          <FormField label="Duración (min)">
            {(id) => (
              <Input
                id={id}
                type="number"
                min={5}
                max={480}
                step={5}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value) || 30)}
              />
            )}
          </FormField>
        </div>

        <FormField label="Asignar a">
          {(id) => (
            <Select id={id} value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)}>
              <option value="">Yo</option>
              {effectiveContactId && assignees.map((a) => (
                <option key={a.id} value={a.id}>{a.name ?? a.email}</option>
              ))}
            </Select>
          )}
        </FormField>

        <FormField label="Recordatorio">
          {(id) => (
            <Select id={id} value={reminderMinutesBefore} onChange={(e) => setReminderMinutesBefore(Number(e.target.value))}>
              {!REMINDER_OPTIONS.some((opt) => opt.value === reminderMinutesBefore) && (
                <option value={reminderMinutesBefore}>{reminderMinutesBefore} minutos antes</option>
              )}
              {REMINDER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </Select>
          )}
        </FormField>

        <FormField label="Notas">
          {(id) => (
            <Textarea id={id} value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Detalles adicionales…" />
          )}
        </FormField>

        {isEdit && (
          <>
            <FormField label="Estado">
              {(id) => (
                <Select id={id} value={status} onChange={(e) => setStatus(e.target.value as AppointmentDetail["status"])}>
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </Select>
              )}
            </FormField>
            {status === "CANCELLED" && (
              <FormField label="Motivo de cancelación">
                {(id) => (
                  <Input id={id} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Opcional" />
                )}
              </FormField>
            )}
          </>
        )}
      </div>
    </Modal>
    <ConfirmDialog
      open={confirmDelete}
      onClose={() => setConfirmDelete(false)}
      onConfirm={deleteAppointment}
      loading={saving}
      title="¿Eliminar esta cita cancelada?"
      description="Se quita de la agenda. No se puede deshacer."
      confirmLabel="Eliminar"
    />
    </>
  );
}
