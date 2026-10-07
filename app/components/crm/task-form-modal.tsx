"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Alert } from "@/app/components/kit/alert";
import { Button } from "@/app/components/kit/button";
import { Dialog, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from "@/app/components/kit/dialog";
import { Field, FieldLabel } from "@/app/components/kit/field";
import { Input } from "@/app/components/kit/input";
import { Textarea } from "@/app/components/kit/textarea";
import { useToast } from "@/app/components/ui/toast";
import { EntityPicker, searchPeople, type PickerOption } from "@/app/components/crm/entity-picker";
import { SimpleSelect } from "@/app/components/crm/simple-select";
import { useTeam } from "@/app/components/crm/use-crm-lookups";
import { REMIND_OPTIONS, TASK_KINDS, isoToLocalInput, type TaskItem, type TaskKind } from "@/lib/crm/task-ui";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  // Contacto ya conocido (desde la ficha): no hace falta el buscador.
  personId?: string;
  personLabel?: string;
  dealId?: string;
  // Presente en modo edición.
  initialData?: TaskItem;
}

// Crea o edita una tarea. Sin `personId` pide buscar el contacto al que se liga.
export function TaskFormModal({ open, onClose, onSaved, personId, personLabel, dealId, initialData }: Props) {
  const { success } = useToast();
  const { data: session } = useSession();
  const isEdit = !!initialData;
  const canAssign = session?.user?.role !== "ejecutivo";
  const lockedPerson = personId ?? initialData?.personId ?? null;
  const team = useTeam(open && canAssign);

  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<TaskKind>("TODO");
  const [dueAt, setDueAt] = useState("");
  const [remind, setRemind] = useState("0");
  const [assigneeId, setAssigneeId] = useState("");
  const [notes, setNotes] = useState("");
  const [picked, setPicked] = useState<PickerOption | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const reset = useCallback(() => {
    setTitle(initialData?.title ?? "");
    setKind(initialData?.kind ?? "TODO");
    setDueAt(initialData?.dueAt ? isoToLocalInput(initialData.dueAt) : "");
    setRemind(initialData ? (initialData.remindMinutesBefore === null ? "none" : String(initialData.remindMinutesBefore)) : "0");
    setAssigneeId(initialData?.assigneeId ?? "");
    setNotes(initialData?.notes ?? "");
    setPicked(null);
    setError("");
  }, [initialData]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reinicio del formulario al abrir, no una carga de datos
    if (open) reset();
  }, [open, reset]);

  async function submit() {
    setError("");
    const targetPerson = lockedPerson ?? picked?.id ?? null;
    if (!isEdit && !targetPerson && !dealId) return setError("Elige el contacto al que pertenece la tarea");
    if (!title.trim()) return setError("Indica qué hay que hacer");

    const due = dueAt ? new Date(dueAt).toISOString() : null;
    const remindMinutesBefore = remind === "none" ? null : Number(remind);
    setSaving(true);
    try {
      let res: Response;
      if (isEdit) {
        const payload: Record<string, unknown> = { title: title.trim(), kind, notes: notes.trim() || null };
        // Fecha y aviso solo si cambiaron: reenviarlos rearmaría un aviso que ya salió.
        const initialDue = initialData!.dueAt ? isoToLocalInput(initialData!.dueAt) : "";
        if (dueAt !== initialDue) payload.dueAt = due;
        if (dueAt !== initialDue || remindMinutesBefore !== initialData!.remindMinutesBefore) payload.remindMinutesBefore = due ? remindMinutesBefore : null;
        if (canAssign && assigneeId !== (initialData!.assigneeId ?? "")) payload.assigneeId = assigneeId || null;
        res = await fetch(`/api/crm/tasks/${initialData!.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      } else {
        const payload: Record<string, unknown> = { title: title.trim(), kind, notes: notes.trim() || null, dueAt: due, remindMinutesBefore, personId: targetPerson, dealId: dealId ?? null };
        if (canAssign && assigneeId) payload.assigneeId = assigneeId;
        res = await fetch("/api/crm/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar la tarea");
      success(isEdit ? "Tarea actualizada" : "Tarea creada");
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la tarea");
    } finally {
      setSaving(false);
    }
  }

  const label = personLabel ?? initialData?.person?.name ?? null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogPopup>
        <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <DialogTitle>{isEdit ? "Editar tarea" : "Nueva tarea"}</DialogTitle>
          </DialogHeader>
          <DialogPanel>
            <div className="space-y-4">
              {error && <Alert variant="error">{error}</Alert>}

              {lockedPerson ? (
                <div className="rounded-lg border bg-surface-light px-3 py-2 text-sm">
                  Contacto: <span className="font-medium">{label ?? "—"}</span>
                </div>
              ) : (
                <Field>
                  <FieldLabel>Contacto</FieldLabel>
                  <div className="w-full"><EntityPicker value={picked} onChange={setPicked} search={searchPeople} placeholder="Buscar por nombre, correo o teléfono" ariaLabel="Contacto" /></div>
                </Field>
              )}

              <Field>
                <FieldLabel>¿Qué hay que hacer?</FieldLabel>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. Llamar para confirmar la propuesta" maxLength={200} autoFocus />
              </Field>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel>Tipo</FieldLabel>
                  <SimpleSelect ariaLabel="Tipo de tarea" value={kind} onChange={(v) => setKind(v as TaskKind)} options={TASK_KINDS} />
                </Field>
                <Field>
                  <FieldLabel>Fecha y hora</FieldLabel>
                  <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel>Aviso</FieldLabel>
                  <SimpleSelect ariaLabel="Aviso" value={dueAt ? remind : "none"} onChange={setRemind} options={REMIND_OPTIONS} disabled={!dueAt} />
                </Field>
                {canAssign && (
                  <Field>
                    <FieldLabel>Responsable</FieldLabel>
                    <SimpleSelect
                      ariaLabel="Responsable"
                      value={assigneeId}
                      onChange={setAssigneeId}
                      options={[{ value: "", label: isEdit ? "Sin asignar" : "Yo" }, ...team.map((u) => ({ value: u.id, label: u.name ?? u.email }))]}
                    />
                  </Field>
                )}
              </div>

              <Field>
                <FieldLabel>Notas</FieldLabel>
                <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={5000} />
              </Field>
            </div>
          </DialogPanel>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button type="submit" loading={saving}>{isEdit ? "Guardar cambios" : "Crear tarea"}</Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
