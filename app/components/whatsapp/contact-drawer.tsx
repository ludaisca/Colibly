"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Plus, CalendarClock, X } from "lucide-react";
import { Drawer } from "@base-ui/react/drawer";
import { Banner } from "@/app/components/ui/banner";
import { Select } from "@/app/components/ui/select";
import { MultiSelect } from "@/app/components/ui/multi-select";
import { Textarea } from "@/app/components/ui/textarea";
import { Input } from "@/app/components/ui/input";
import { Button } from "@/app/components/ui/button";
import { Spinner } from "@/app/components/ui/spinner";
import { useToast } from "@/app/components/ui/toast";
import { AppointmentFormModal, type AppointmentDetail } from "@/app/components/whatsapp/appointment-form-modal";
import { ContactDeals, type ContactDeal } from "@/app/components/pipeline/contact-deals";
import { ContactTasks } from "@/app/components/crm/contact-tasks";
import { PersonTimeline } from "@/app/components/crm/person-timeline";
import "./contact-drawer.css";

interface ContactDetail {
  id: string;
  name: string | null;
  remoteJid: string;
  personId: string;
  deals: ContactDeal[];
  optedOutMarketing: boolean;
  tags: Array<{ tag: { id: string; name: string; color: string } }>;
}

interface Note {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string | null };
}

interface TagOption {
  id: string;
  name: string;
  color: string;
}

interface CustomFieldDefinition {
  id: string;
  key: string;
  label: string;
  type: "TEXT" | "NUMBER" | "DATE" | "BOOLEAN" | "SELECT";
  options: string[];
  required: boolean;
}

export function ContactDrawer({
  contactId,
  onClose,
  onUpdated,
}: {
  contactId: string;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const { error: toastError } = useToast();
  const [contact, setContact] = useState<ContactDetail | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [allTags, setAllTags] = useState<TagOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [newTagName, setNewTagName] = useState("");
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
      if (Array.isArray(notesData)) setNotes(notesData);
      if (Array.isArray(tagsData)) setAllTags(tagsData);
      setNextAppointment(Array.isArray(appointmentsData) ? (appointmentsData[0] ?? null) : null);
      if (Array.isArray(customFieldsData?.definitions)) {
        setCustomFieldDefs(customFieldsData.definitions);
        setCustomFieldValues(
          Object.fromEntries(
            Object.entries(customFieldsData.values ?? {}).map(([k, v]) => [k, (v as string | null) ?? ""])
          )
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al cargar el contacto";
      setLoadError(message);
      toastError(message);
    } finally {
      setLoading(false);
    }
  }, [contactId, toastError]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; fetchAll also used for manual refresh
    fetchAll();
  }, [fetchAll]);

  async function handleTagsChange(tagIds: string[]) {
    if (!contact) return;
    const currentIds = contact.tags.map((t) => t.tag.id);
    const toAdd = tagIds.filter((id) => !currentIds.includes(id));
    const toRemove = currentIds.filter((id) => !tagIds.includes(id));

    try {
      await Promise.all([
        ...toAdd.map((tagId) =>
          fetch(`/api/whatsapp/contacts/${contactId}/tags`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tagId }),
          })
        ),
        ...toRemove.map((tagId) =>
          fetch(`/api/whatsapp/contacts/${contactId}/tags?tagId=${tagId}`, {
            method: "DELETE",
          })
        ),
      ]);
      setContact({
        ...contact,
        tags: allTags.filter((t) => tagIds.includes(t.id)).map((tag) => ({ tag })),
      });
      onUpdated();
    } catch {
      toastError("Error al actualizar etiquetas");
    }
  }

  async function handleCreateTag() {
    if (!newTagName.trim()) return;
    try {
      const res = await fetch("/api/whatsapp/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTagName.trim(), contactId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al crear etiqueta");
      const newTag: TagOption = data;
      setAllTags((prev) => [...prev, newTag]);
      setNewTagName("");
      if (contact) {
        await fetch(`/api/whatsapp/contacts/${contactId}/tags`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tagId: newTag.id }),
        });
        // Append the tag object we already have in hand instead of routing through
        // handleTagsChange, which rebuilds contact.tags from `allTags` — that state
        // update from setAllTags above hasn't flushed yet, so the new tag wouldn't
        // be in it and the drawer would show "Sin etiquetas" despite saving fine.
        setContact((prev) => prev && { ...prev, tags: [...prev.tags, { tag: newTag }] });
        onUpdated();
      }
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Error al crear etiqueta");
    }
  }

  async function handleSaveCustomFields() {
    setSavingFields(true);
    try {
      const res = await fetch(`/api/whatsapp/contacts/${contactId}/custom-fields`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values: customFieldValues }),
      });
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
      const res = await fetch(`/api/whatsapp/contacts/${contactId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: newNote.trim() }),
      });
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

  return (
    <Drawer.Root defaultOpen modal={!appointmentModalOpen} swipeDirection="right" onOpenChangeComplete={(open) => { if (!open) onClose(); }}>
      <Drawer.Portal>
        <Drawer.Backdrop className="colibly-contact-backdrop" />
        <Drawer.Viewport className="colibly-contact-viewport">
          <Drawer.Popup className="colibly-contact-popup">
            <Drawer.Content className="flex h-full flex-col">
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-4">
                <Drawer.Title className="truncate text-sm font-semibold text-foreground">{contact?.name ?? contact?.remoteJid ?? "Contacto"}</Drawer.Title>
                <Drawer.Close aria-label="Cerrar ficha" className="rounded-[9px] p-1.5 text-muted hover:bg-surface-light hover:text-foreground"><X size={18} /></Drawer.Close>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-5">
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner />
        </div>
      ) : loadError || !contact ? (
        <Banner tone="danger">{loadError ?? "No se pudo cargar el contacto"}</Banner>
      ) : (
        <div className="space-y-5">
          {contact.optedOutMarketing && (
            <Banner tone="warning">
              Este contacto se dio de baja de mensajes de marketing por WhatsApp — no recibirá futuras campañas.
            </Banner>
          )}

          <ContactDeals
            personId={contact.personId}
            contactId={contactId}
            deals={contact.deals}
            onChanged={() => {
              void fetchAll();
              onUpdated();
            }}
          />

          <ContactTasks personId={contact.personId} personLabel={contact.name ?? contact.remoteJid} />

          <div>
            <label className="block text-xs font-medium text-muted-darker mb-1.5">Etiquetas</label>
            <MultiSelect
              options={allTags.map((t) => ({ value: t.id, label: t.name }))}
              value={contact.tags.map((t) => t.tag.id)}
              onChange={handleTagsChange}
              placeholder="Sin etiquetas"
            />
            <div className="flex gap-2 mt-2">
              <Input
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="Nueva etiqueta..."
                className="flex-1"
              />
              <Button size="sm" variant="secondary" icon={Plus} onClick={handleCreateTag}>
                Crear
              </Button>
            </div>
          </div>

          {customFieldDefs.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-muted-darker mb-1.5">Campos personalizados</label>
              <div className="space-y-3">
                {customFieldDefs.map((def) => {
                  const value = customFieldValues[def.id] ?? "";
                  return (
                    <div key={def.id}>
                      <label className="block text-xs text-muted-darker mb-1">
                        {def.label}
                        {def.required && <span className="ml-1 text-danger" aria-hidden="true">*</span>}
                      </label>
                      {def.type === "SELECT" ? (
                        <Select
                          value={value}
                          onChange={(e) => setCustomFieldValues((prev) => ({ ...prev, [def.id]: e.target.value }))}
                          placeholder="Sin seleccionar"
                        >
                          {def.options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                        </Select>
                      ) : def.type === "BOOLEAN" ? (
                        <Select
                          value={value}
                          onChange={(e) => setCustomFieldValues((prev) => ({ ...prev, [def.id]: e.target.value }))}
                        >
                          <option value="">Sin especificar</option>
                          <option value="true">Sí</option>
                          <option value="false">No</option>
                        </Select>
                      ) : (
                        <Input
                          type={def.type === "NUMBER" ? "number" : def.type === "DATE" ? "date" : "text"}
                          value={value}
                          onChange={(e) => setCustomFieldValues((prev) => ({ ...prev, [def.id]: e.target.value }))}
                        />
                      )}
                    </div>
                  );
                })}
                <Button size="sm" variant="secondary" onClick={handleSaveCustomFields} disabled={savingFields}>
                  {savingFields ? "Guardando..." : "Guardar campos"}
                </Button>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-muted-darker mb-1.5">Próxima cita</label>
            {nextAppointment ? (
              <div className="rounded-lg border border-border bg-surface-light p-3">
                <div className="flex items-start gap-2.5">
                  <CalendarClock size={16} className="text-muted-darker shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{nextAppointment.title}</p>
                    <p className="text-xs text-muted-darker mt-0.5">
                      {new Date(nextAppointment.scheduledAt).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                  </div>
                </div>
                <Link href={`/whatsapp/citas?contactId=${contactId}`} className="mt-2 inline-block text-xs text-accent-ink hover:underline">
                  Ver todas las citas
                </Link>
              </div>
            ) : (
              <div className="flex items-center justify-between rounded-lg border border-dashed border-border p-3">
                <p className="text-xs text-muted-darker">Sin citas próximas</p>
                <Button size="sm" variant="secondary" icon={CalendarClock} onClick={() => setAppointmentModalOpen(true)}>
                  Agendar cita
                </Button>
              </div>
            )}
            {nextAppointment && (
              <Button
                size="sm"
                variant="secondary"
                icon={CalendarClock}
                className="mt-2"
                onClick={() => setAppointmentModalOpen(true)}
              >
                Agendar otra cita
              </Button>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-darker mb-1.5">Notas internas</label>
            <div className="space-y-2 mb-3">
              <Textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Agregar una nota..."
                rows={3}
              />
              <Button size="sm" onClick={handleAddNote} disabled={savingNote || !newNote.trim()}>
                {savingNote ? "Guardando..." : "Agregar nota"}
              </Button>
            </div>
            <div className="space-y-3">
              {notes.length === 0 ? (
                <p className="text-xs text-muted-darker">Sin notas todavía.</p>
              ) : (
                notes.map((note) => (
                  <div key={note.id} className="rounded-lg border border-border bg-surface-light p-3">
                    <p className="text-sm text-foreground whitespace-pre-wrap">{note.body}</p>
                    <p className="text-xs text-muted-darker mt-1.5">
                      {note.author.name ?? "Usuario"} · {new Date(note.createdAt).toLocaleDateString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          <PersonTimeline personId={contact.personId} refreshKey={notes.length} />
        </div>
      )}
              </div>
            </Drawer.Content>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>

      {contact && (
        <AppointmentFormModal
          open={appointmentModalOpen}
          onClose={() => setAppointmentModalOpen(false)}
          onSaved={fetchAll}
          contactId={contact.id}
          contactLabel={contact.name ?? contact.remoteJid}
        />
      )}
    </Drawer.Root>
  );
}
