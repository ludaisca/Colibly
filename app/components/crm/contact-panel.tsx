"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Building2, CalendarClock, Mail, Phone, UserRound } from "lucide-react";
import { Alert } from "@/app/components/kit/alert";
import { Badge } from "@/app/components/kit/badge";
import { Button } from "@/app/components/kit/button";
import { Input } from "@/app/components/kit/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/app/components/kit/select";
import { Skeleton } from "@/app/components/kit/skeleton";
import { Textarea } from "@/app/components/kit/textarea";
import { useToast } from "@/app/components/ui/toast";
import { formatPhoneDisplay } from "@/lib/phone";
import { AppointmentFormModal, type AppointmentDetail } from "@/app/components/whatsapp/appointment-form-modal";
import { ContactDeals, type ContactDeal } from "@/app/components/pipeline/contact-deals";
import { ContactTasks } from "@/app/components/crm/contact-tasks";
import { ContactAvatar } from "@/app/components/crm/contact-avatar";
import { TagChips, type TagOption } from "@/app/components/crm/tag-chips";
import { PersonTimeline } from "@/app/components/crm/person-timeline";

// Ficha de contacto reutilizable: va dentro del cajón (desde Contactos) y como
// columna fija de la bandeja de chats. Reúne lo que el equipo necesita para
// atender a la persona sin salir de la conversación: quién es, sus negocios,
// tareas, próxima cita, etiquetas, campos propios y notas.

export interface ContactDetail {
  id: string;
  name: string | null;
  remoteJid: string;
  personId: string;
  deals: ContactDeal[];
  optedOutMarketing: boolean;
  tags: Array<{ tag: TagOption }>;
}

interface PersonSummary {
  name: string | null;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  lifecycle: "LEAD" | "CUSTOMER";
  company: { id: string; name: string } | null;
  owner: { id: string; name: string | null } | null;
}

interface Note {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string | null };
}

interface CustomFieldDefinition {
  id: string;
  key: string;
  label: string;
  type: "TEXT" | "NUMBER" | "DATE" | "BOOLEAN" | "SELECT";
  options: string[];
  required: boolean;
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function ContactPanel({
  contactId,
  onUpdated,
  onTitle,
  onModalOpenChange,
  onLoaded,
  activitySlot = false,
}: {
  contactId: string;
  onUpdated: () => void;
  /** Para que el cajón ponga el nombre en su título. */
  onTitle?: (title: string) => void;
  /** El cajón deja de ser modal mientras un diálogo propio de la ficha está abierto. */
  onModalOpenChange?: (open: boolean) => void;
  /** Avisa con el contacto ya cargado (la bandeja necesita el id de la persona para su pestaña de actividad). */
  onLoaded?: (contact: ContactDetail) => void;
  /** Con `true`, la línea de tiempo no se pinta aquí (la bandeja la muestra en su propia pestaña). */
  activitySlot?: boolean;
}) {
  const { error: toastError } = useToast();
  const [contact, setContact] = useState<ContactDetail | null>(null);
  const [person, setPerson] = useState<PersonSummary | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [allTags, setAllTags] = useState<TagOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [nextAppointment, setNextAppointment] = useState<AppointmentDetail | null>(null);
  const [appointmentModalOpen, setAppointmentModalOpen] = useState(false);
  const [customFieldDefs, setCustomFieldDefs] = useState<CustomFieldDefinition[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  const [savingFields, setSavingFields] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [contactRes, notesRes, tagsRes, appointmentsRes, customFieldsRes] = await Promise.all([
        fetch(`/api/whatsapp/contacts/${contactId}`),
        fetch(`/api/whatsapp/contacts/${contactId}/notes`),
        fetch(`/api/whatsapp/tags?contactId=${contactId}`),
        fetch(`/api/whatsapp/appointments?contactId=${contactId}&upcoming=true&limit=1`),
        fetch(`/api/whatsapp/contacts/${contactId}/custom-fields`),
      ]);
      const contactData = await contactRes.json();
      if (!contactRes.ok) throw new Error(contactData.error ?? "Error al cargar el contacto");
      const notesData = await notesRes.json();
      const tagsData = await tagsRes.json();
      const appointmentsData = await appointmentsRes.json();
      const customFieldsData = await customFieldsRes.json();
      setContact(contactData);
      onLoaded?.(contactData);
      if (Array.isArray(notesData)) setNotes(notesData);
      if (Array.isArray(tagsData)) setAllTags(tagsData);
      setNextAppointment(Array.isArray(appointmentsData) ? (appointmentsData[0] ?? null) : null);
      if (Array.isArray(customFieldsData?.definitions)) {
        setCustomFieldDefs(customFieldsData.definitions);
        setCustomFieldValues(Object.fromEntries(Object.entries(customFieldsData.values ?? {}).map(([k, v]) => [k, (v as string | null) ?? ""])));
      }
      // Datos de la persona (nombre, empresa, responsable…): si fallan, la ficha
      // sigue siendo útil con lo del canal.
      const personRes = await fetch(`/api/crm/people/${contactData.personId}`);
      if (personRes.ok) setPerson(await personRes.json());
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al cargar el contacto";
      setLoadError(message);
      toastError(message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onLoaded solo se invoca al terminar la carga; no debe relanzarla
  }, [contactId, toastError]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga al montar; fetchAll también refresca a mano
    fetchAll();
  }, [fetchAll]);

  const displayName = person?.name ?? contact?.name ?? contact?.remoteJid ?? "Contacto";
  useEffect(() => {
    onTitle?.(displayName);
  }, [displayName, onTitle]);

  useEffect(() => {
    onModalOpenChange?.(appointmentModalOpen);
  }, [appointmentModalOpen, onModalOpenChange]);

  async function addTag(tagId: string) {
    const tag = allTags.find((t) => t.id === tagId);
    if (!contact || !tag) return;
    try {
      const res = await fetch(`/api/whatsapp/contacts/${contactId}/tags`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tagId }) });
      if (!res.ok) throw new Error();
      setContact((prev) => prev && (prev.tags.some((t) => t.tag.id === tagId) ? prev : { ...prev, tags: [...prev.tags, { tag }] }));
      onUpdated();
    } catch {
      toastError("Error al actualizar etiquetas");
    }
  }

  async function removeTag(tagId: string) {
    try {
      const res = await fetch(`/api/whatsapp/contacts/${contactId}/tags?tagId=${tagId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setContact((prev) => prev && { ...prev, tags: prev.tags.filter((t) => t.tag.id !== tagId) });
      onUpdated();
    } catch {
      toastError("Error al actualizar etiquetas");
    }
  }

  async function createTag(name: string) {
    try {
      const res = await fetch("/api/whatsapp/tags", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, contactId }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al crear etiqueta");
      const newTag: TagOption = data;
      setAllTags((prev) => [...prev, newTag]);
      const assign = await fetch(`/api/whatsapp/contacts/${contactId}/tags`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tagId: newTag.id }) });
      if (!assign.ok) throw new Error("La etiqueta se creó pero no se pudo asignar");
      setContact((prev) => prev && { ...prev, tags: [...prev.tags, { tag: newTag }] });
      onUpdated();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Error al crear etiqueta");
    }
  }

  async function handleSaveCustomFields() {
    setSavingFields(true);
    try {
      const res = await fetch(`/api/whatsapp/contacts/${contactId}/custom-fields`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values: customFieldValues }) });
      if (!res.ok) throw new Error();
      onUpdated();
    } catch {
      toastError("Error al guardar los campos personalizados");
    } finally {
      setSavingFields(false);
    }
  }

  async function handleAddNote() {
    if (!newNote.trim()) return;
    setSavingNote(true);
    try {
      const res = await fetch(`/api/whatsapp/contacts/${contactId}/notes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: newNote.trim() }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al agregar nota");
      setNotes((prev) => [data, ...prev]);
      setNewNote("");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Error al agregar nota");
    } finally {
      setSavingNote(false);
    }
  }

  if (loading && !contact) {
    return (
      <div className="space-y-4 p-4" aria-busy="true" aria-label="Cargando la ficha">
        <div className="flex items-center gap-3"><Skeleton className="size-14 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/2" /></div></div>
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (loadError || !contact) {
    return <div className="p-4"><Alert variant="error">{loadError ?? "No se pudo cargar el contacto"}</Alert></div>;
  }

  const phone = person?.phone ? formatPhoneDisplay(person.phone) : /^\d{8,}$/.test(contact.remoteJid) ? formatPhoneDisplay(contact.remoteJid) : null;

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-start gap-3">
        <ContactAvatar id={contact.personId} name={displayName} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-foreground">{displayName}</h2>
          {(person?.jobTitle || person?.company) && (
            <p className="truncate text-sm text-muted-foreground">{[person.jobTitle, person.company?.name].filter(Boolean).join(" · ")}</p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {person && <Badge variant={person.lifecycle === "CUSTOMER" ? "success" : "info"}>{person.lifecycle === "CUSTOMER" ? "Cliente" : "Prospecto"}</Badge>}
            {contact.optedOutMarketing && <Badge variant="warning">Sin marketing</Badge>}
          </div>
        </div>
      </div>

      <dl className="space-y-2 text-sm">
        {phone && <div className="flex items-center gap-2.5"><Phone size={14} className="shrink-0 text-muted-foreground" /><dd className="truncate tabular-nums">{phone}</dd></div>}
        {person?.email && <div className="flex items-center gap-2.5"><Mail size={14} className="shrink-0 text-muted-foreground" /><dd className="truncate">{person.email}</dd></div>}
        {person?.company && <div className="flex items-center gap-2.5"><Building2 size={14} className="shrink-0 text-muted-foreground" /><dd className="truncate">{person.company.name}</dd></div>}
        <div className="flex items-center gap-2.5"><UserRound size={14} className="shrink-0 text-muted-foreground" /><dd className="truncate">{person?.owner?.name ? `Responsable: ${person.owner.name}` : "Sin responsable"}</dd></div>
      </dl>

      {contact.optedOutMarketing && (
        <Alert variant="warning">Se dio de baja de mensajes de marketing por WhatsApp: no recibirá futuras campañas.</Alert>
      )}

      <ContactDeals personId={contact.personId} contactId={contactId} deals={contact.deals} onChanged={() => { void fetchAll(); onUpdated(); }} />

      <ContactTasks personId={contact.personId} personLabel={displayName} />

      <Section
        title="Próxima cita"
        action={
          <Button size="xs" variant="ghost" onClick={() => setAppointmentModalOpen(true)}>
            <CalendarClock /> {nextAppointment ? "Otra cita" : "Agendar"}
          </Button>
        }
      >
        {nextAppointment ? (
          <div className="rounded-lg border bg-card p-3">
            <p className="truncate text-sm font-medium text-foreground">{nextAppointment.title}</p>
            <p suppressHydrationWarning className="mt-0.5 text-xs text-muted-foreground">
              {new Date(nextAppointment.scheduledAt).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}
            </p>
            <Link href={`/whatsapp/citas?contactId=${contactId}`} className="mt-2 inline-block text-xs font-medium text-accent-ink hover:underline">Ver todas las citas</Link>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Sin citas próximas.</p>
        )}
      </Section>

      <Section title="Etiquetas">
        <TagChips tags={contact.tags.map((t) => t.tag)} allTags={allTags} onAdd={addTag} onRemove={removeTag} onCreate={createTag} />
      </Section>

      {customFieldDefs.length > 0 && (
        <Section title="Campos personalizados">
          <div className="space-y-3">
            {customFieldDefs.map((def) => {
              const value = customFieldValues[def.id] ?? "";
              const set = (v: string) => setCustomFieldValues((prev) => ({ ...prev, [def.id]: v }));
              return (
                <div key={def.id} className="space-y-1">
                  <label className="block text-xs text-muted-foreground">
                    {def.label}
                    {def.required && <span className="ml-1 text-destructive" aria-hidden="true">*</span>}
                  </label>
                  {def.type === "SELECT" || def.type === "BOOLEAN" ? (
                    <Select value={value} onValueChange={(v) => set(v ?? "")}>
                      <SelectTrigger aria-label={def.label}>
                        <SelectValue>{def.type === "BOOLEAN" ? (value === "true" ? "Sí" : value === "false" ? "No" : "Sin especificar") : value || "Sin seleccionar"}</SelectValue>
                      </SelectTrigger>
                      <SelectPopup>
                        {def.type === "BOOLEAN" ? (
                          <>
                            <SelectItem value="">Sin especificar</SelectItem>
                            <SelectItem value="true">Sí</SelectItem>
                            <SelectItem value="false">No</SelectItem>
                          </>
                        ) : (
                          <>
                            <SelectItem value="">Sin seleccionar</SelectItem>
                            {def.options.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                          </>
                        )}
                      </SelectPopup>
                    </Select>
                  ) : (
                    <Input type={def.type === "NUMBER" ? "number" : def.type === "DATE" ? "date" : "text"} value={value} onChange={(e) => set(e.target.value)} aria-label={def.label} />
                  )}
                </div>
              );
            })}
            <Button size="sm" variant="outline" onClick={handleSaveCustomFields} loading={savingFields}>Guardar campos</Button>
          </div>
        </Section>
      )}

      <Section title="Notas internas">
        <div className="space-y-2">
          <Textarea value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="Agrega una nota para el equipo" rows={3} aria-label="Nueva nota" />
          <Button size="sm" onClick={handleAddNote} disabled={!newNote.trim()} loading={savingNote}>Agregar nota</Button>
        </div>
        {notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin notas todavía.</p>
        ) : (
          <ul className="space-y-2">
            {notes.map((note) => (
              <li key={note.id} className="rounded-lg border bg-card p-3">
                <p className="whitespace-pre-wrap text-sm text-foreground">{note.body}</p>
                <p suppressHydrationWarning className="mt-1.5 text-xs text-muted-foreground">
                  {note.author.name ?? "Usuario"} · {new Date(note.createdAt).toLocaleDateString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {!activitySlot && <PersonTimeline personId={contact.personId} refreshKey={notes.length} />}

      <AppointmentFormModal open={appointmentModalOpen} onClose={() => setAppointmentModalOpen(false)} onSaved={fetchAll} contactId={contact.id} contactLabel={displayName} />
    </div>
  );
}
