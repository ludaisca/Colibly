"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { Search, X } from "lucide-react";
import { Modal } from "@/app/components/ui/modal";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Select } from "@/app/components/ui/select";
import { Textarea } from "@/app/components/ui/textarea";
import { FormField } from "@/app/components/ui/form-field";
import { Banner } from "@/app/components/ui/banner";
import { useToast } from "@/app/components/ui/toast";
import { REMIND_OPTIONS, TASK_KINDS, isoToLocalInput, type TaskItem, type TaskKind } from "@/lib/crm/task-ui";

interface PersonOption {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
}

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
  const searchBoxRef = useRef<HTMLDivElement>(null);

  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<TaskKind>("TODO");
  const [dueAt, setDueAt] = useState("");
  const [remind, setRemind] = useState("0");
  const [assigneeId, setAssigneeId] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [team, setTeam] = useState<Array<{ id: string; name: string | null; email: string }>>([]);
  const [selected, setSelected] = useState<PersonOption | null>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<PersonOption[]>([]);
  const [showResults, setShowResults] = useState(false);

  const reset = useCallback(() => {
    setTitle(initialData?.title ?? "");
    setKind(initialData?.kind ?? "TODO");
    setDueAt(initialData?.dueAt ? isoToLocalInput(initialData.dueAt) : "");
    setRemind(initialData ? (initialData.remindMinutesBefore === null ? "none" : String(initialData.remindMinutesBefore)) : "0");
    setAssigneeId(initialData?.assigneeId ?? "");
    setNotes(initialData?.notes ?? "");
    setSelected(null);
    setSearch("");
    setResults([]);
    setShowResults(false);
    setError("");
  }, [initialData]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reinicio del formulario al abrir, no una carga de datos
    if (open) reset();
  }, [open, reset]);

  useEffect(() => {
    if (!open || !canAssign) return;
    fetch("/api/crm/team")
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => setTeam(d.items ?? []))
      .catch(() => undefined);
  }, [open, canAssign]);

  useEffect(() => {
    if (lockedPerson || !open) return;
    const term = search.trim();
    if (!term) return;
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/crm/people?q=${encodeURIComponent(term)}&pageSize=8`);
        const data = await res.json();
        if (Array.isArray(data.items)) setResults(data.items);
      } catch {
        // silencioso: se puede reintentar escribiendo
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [search, lockedPerson, open]);

  useEffect(() => {
    if (!showResults) return;
    const handler = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) setShowResults(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showResults]);

  async function submit() {
    setError("");
    const targetPerson = lockedPerson ?? selected?.id ?? null;
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

  const label = personLabel ?? initialData?.person?.name ?? selected?.name ?? null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Editar tarea" : "Nueva tarea"}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear tarea"}</Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Banner tone="danger">{error}</Banner>}

        {lockedPerson ? (
          <div className="rounded-lg border border-border bg-surface-light px-3.5 py-2.5 text-sm text-foreground">
            Contacto: <span className="font-medium">{label ?? "—"}</span>
          </div>
        ) : (
          <FormField label="Contacto" required>
            {(id) => (
              <div ref={searchBoxRef} className="relative">
                {selected ? (
                  <div className="flex items-center justify-between rounded-lg border border-border bg-surface-light px-3.5 py-2.5 text-sm">
                    <span className="font-medium text-foreground">{selected.name}</span>
                    <button type="button" onClick={() => { setSelected(null); setSearch(""); }} className="text-muted-darker hover:text-foreground" aria-label="Quitar contacto">
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <>
                    <Input id={id} icon={Search} value={search} onChange={(e) => { setSearch(e.target.value); setShowResults(true); }} onFocus={() => setShowResults(true)} placeholder="Buscar por nombre, correo o teléfono..." />
                    {showResults && search.trim() && results.length > 0 && (
                      <div className="absolute z-10 mt-1.5 max-h-56 w-full overflow-y-auto rounded-lg border border-border bg-surface shadow-lg">
                        {results.map((p) => (
                          <button key={p.id} type="button" onClick={() => { setSelected(p); setShowResults(false); }} className="w-full px-3.5 py-2 text-left text-sm transition-colors hover:bg-surface-light">
                            <p className="font-medium text-foreground">{p.name}</p>
                            <p className="text-xs text-muted-darker">{p.phone ?? p.email ?? ""}</p>
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

        <FormField label="¿Qué hay que hacer?" required>
          {(id) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. Llamar para confirmar la propuesta" />}
        </FormField>

        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Tipo">
            {(id) => (
              <Select id={id} value={kind} onChange={(e) => setKind(e.target.value as TaskKind)}>
                {TASK_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </Select>
            )}
          </FormField>
          <FormField label="Fecha y hora">
            {(id) => <Input id={id} type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />}
          </FormField>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Aviso">
            {(id) => (
              <Select id={id} value={dueAt ? remind : "none"} disabled={!dueAt} onChange={(e) => setRemind(e.target.value)}>
                {REMIND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            )}
          </FormField>
          {canAssign && (
            <FormField label="Responsable">
              {(id) => (
                <Select id={id} value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                  <option value="">{isEdit ? "Sin asignar" : "Yo"}</option>
                  {team.map((u) => <option key={u.id} value={u.id}>{u.name ?? u.email}</option>)}
                </Select>
              )}
            </FormField>
          )}
        </div>

        <FormField label="Notas">
          {(id) => <Textarea id={id} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />}
        </FormField>
      </div>
    </Modal>
  );
}
