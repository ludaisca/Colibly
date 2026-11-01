"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Plus, CalendarClock, Link2, X, Save, MessageSquare } from "lucide-react";
import { usePathname } from "next/navigation";
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
import { ContactTasks } from "@/app/components/whatsapp/contact-tasks";
import { ContactTimeline } from "@/app/components/whatsapp/contact-timeline";
import { HeroTabs } from "@/app/components/ui/hero-tabs";
import { FormField } from "@/app/components/ui/form-field";
import { DEAL_VALUE_MAX_PESOS, centsToPesos, formatMxn } from "@/lib/money";
import "./contact-drawer.css";

interface ContactDetail {
  id: string;
  name: string | null;
  remoteJid: string;
  leadStatus: string;
  optedOutMarketing: boolean;
  overLimit?: boolean;
  accountId: string | null;
  chat?: { id: string } | null;
  dealValueCents: number | null;
  expectedCloseAt: string | null;
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

const LEAD_STATUS_OPTIONS = [
  { value: "NEW", label: "Nuevo" },
  { value: "CONTACTED", label: "Contactado" },
  { value: "QUALIFIED", label: "Calificado" },
  { value: "CUSTOMER", label: "Cliente" },
  { value: "LOST", label: "Perdido" },
];

// Pestañas de la ficha (U1). La elegida va en la URL como `ficha=` para que
// "Copiar enlace" abra la misma pestaña; la bandeja la conserva al cambiar
// filtros igual que `contacto`.
const DRAWER_TABS = [
  { id: "resumen", label: "Resumen" },
  { id: "actividad", label: "Actividad" },
  { id: "tareas", label: "Tareas y citas" },
  { id: "campos", label: "Campos" },
] as const;
type DrawerTab = (typeof DRAWER_TABS)[number]["id"];
const TAB_PARAM = "ficha";

function readTabFromUrl(): DrawerTab {
  if (typeof window === "undefined") return "resumen";
  const value = new URLSearchParams(window.location.search).get(TAB_PARAM);
  return DRAWER_TABS.some((tab) => tab.id === value) ? (value as DrawerTab) : "resumen";
}

function writeTabToUrl(tab: DrawerTab | null) {
  const params = new URLSearchParams(window.location.search);
  if (tab && tab !== "resumen") params.set(TAB_PARAM, tab);
  else params.delete(TAB_PARAM);
  const qs = params.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
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
  const { success: toastSuccess, error: toastError } = useToast();
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
  const [timelineKey, setTimelineKey] = useState(0);
  const [tab, setTab] = useState<DrawerTab>(readTabFromUrl);
  const [dealValue, setDealValue] = useState("");
  const [closeDate, setCloseDate] = useState("");
  const [savingDeal, setSavingDeal] = useState(false);
  const pathname = usePathname();
  const inChat = pathname.startsWith("/whatsapp/chat");

  function changeTab(next: DrawerTab) {
    setTab(next);
    writeTabToUrl(next);
  }

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
      setDealValue(contactData.dealValueCents != null ? String(centsToPesos(contactData.dealValueCents)) : "");
      setCloseDate(contactData.expectedCloseAt ? String(contactData.expectedCloseAt).slice(0, 10) : "");
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

  async function handleLeadStatusChange(leadStatus: string) {
    if (!contact) return;
    setContact({ ...contact, leadStatus });
    try {
      const res = await fetch(`/api/whatsapp/contacts/${contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadStatus }),
      });
      if (!res.ok) throw new Error();
      setTimelineKey((key) => key + 1);
      onUpdated();
    } catch {
      toastError("Error al actualizar el estado");
    }
  }

  // Valor del trato en pesos; vacío = sin valor. La fecha se guarda como
  // medianoche UTC del día elegido (la tarjeta del tablero la muestra en UTC).
  async function handleSaveDeal() {
    const trimmed = dealValue.trim().replace(/[$,\s]/g, "");
    const pesos = trimmed === "" ? null : Number(trimmed);
    if (pesos !== null && (!Number.isFinite(pesos) || pesos < 0 || pesos > DEAL_VALUE_MAX_PESOS)) {
      toastError("Escribe un monto entre $0 y $20,000,000");
      return;
    }
    setSavingDeal(true);
    try {
      const res = await fetch(`/api/whatsapp/contacts/${contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealValue: pesos, expectedCloseAt: closeDate ? `${closeDate}T00:00:00.000Z` : null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "No se pudo guardar el trato");
      setContact((prev) => prev && { ...prev, dealValueCents: data.dealValueCents ?? null, expectedCloseAt: data.expectedCloseAt ?? null });
      toastSuccess("Trato guardado");
      setTimelineKey((key) => key + 1);
      onUpdated();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "No se pudo guardar el trato");
    } finally {
      setSavingDeal(false);
    }
  }

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
      setTimelineKey((key) => key + 1);
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
      setTimelineKey((key) => key + 1);
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
      setTimelineKey((key) => key + 1);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Error al agregar nota");
    } finally {
      setSavingNote(false);
    }
  }

  return (
    <Drawer.Root defaultOpen modal={!appointmentModalOpen} swipeDirection="right" onOpenChangeComplete={(open) => { if (!open) { writeTabToUrl(null); onClose(); } }}>
      <Drawer.Portal>
        <Drawer.Backdrop className="colibly-contact-backdrop" />
        <Drawer.Viewport className="colibly-contact-viewport">
          <Drawer.Popup className="colibly-contact-popup">
            <Drawer.Content className="flex h-full flex-col">
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-4">
                <Drawer.Title className="truncate text-sm font-semibold text-foreground">{contact?.name ?? contact?.remoteJid ?? "Contacto"}</Drawer.Title>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    aria-label="Copiar enlace del contacto"
                    title="Copiar enlace"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(window.location.href);
                        toastSuccess("Enlace copiado");
                      } catch {
                        toastError("No se pudo copiar el enlace");
                      }
                    }}
                    className="rounded-[9px] p-1.5 text-muted hover:bg-surface-light hover:text-foreground"
                  >
                    <Link2 size={16} />
                  </button>
                  <Drawer.Close aria-label="Cerrar ficha" className="rounded-[9px] p-1.5 text-muted hover:bg-surface-light hover:text-foreground"><X size={18} /></Drawer.Close>
                </div>
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
          {contact.overLimit && (
            <Banner tone="danger" title="Fuera del límite de contactos">
              Este contacto llegó cuando tu organización ya pasaba del 120 % de los contactos de su plan. Sus mensajes se guardan y puedes
              atenderlo a mano, pero bots, automatizaciones, secuencias y calificación con IA no corren para él hasta que mejores tu plan o
              agregues ejecutivos en <a href="/configuracion/plan" className="font-medium underline underline-offset-2">Plan y facturación</a>.
            </Banner>
          )}
          {contact.optedOutMarketing && (
            <Banner tone="warning">
              Este contacto se dio de baja de mensajes de marketing por WhatsApp — no recibirá futuras campañas.
            </Banner>
          )}

          <HeroTabs items={DRAWER_TABS} value={tab} onChange={changeTab} label="Secciones del contacto">
            <div className="space-y-5 pt-4">
              {tab === "resumen" && (
                <>
          <div>
            <label className="block text-xs font-medium text-muted-darker mb-1.5">Estado de lead</label>
            <Select value={contact.leadStatus} onChange={(e) => handleLeadStatusChange(e.target.value)}>
              {LEAD_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </Select>
          </div>

          <div className="rounded-lg border border-border p-3">
            <p className="mb-2 text-xs font-medium text-muted-darker">Trato</p>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Valor (MXN)">
                {(id) => (
                  <Input id={id} inputMode="decimal" value={dealValue} onChange={(e) => setDealValue(e.target.value)} placeholder="12,500" />
                )}
              </FormField>
              <FormField label="Cierre estimado">
                {(id) => <Input id={id} type="date" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} />}
              </FormField>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-xs text-muted-darker">
                {contact.dealValueCents != null ? `Guardado: ${formatMxn(contact.dealValueCents)}` : "Sin valor guardado"}
              </p>
              <Button size="sm" variant="secondary" icon={Save} loading={savingDeal} onClick={handleSaveDeal}>
                Guardar trato
              </Button>
            </div>
          </div>
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

          {nextAppointment && (
            <button
              type="button"
              onClick={() => changeTab("tareas")}
              className="flex w-full items-center gap-2 rounded-lg border border-border bg-surface-light px-3 py-2 text-left text-xs text-muted-darker hover:text-foreground"
            >
              <CalendarClock size={14} className="shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                Próxima cita: <span className="font-medium text-foreground">{nextAppointment.title}</span> ·{" "}
                {new Date(nextAppointment.scheduledAt).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}
              </span>
            </button>
          )}
                </>
              )}
              {tab === "actividad" && (
                <>
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

          <ContactTimeline contactId={contactId} refreshKey={timelineKey} />
                </>
              )}
              {tab === "tareas" && (
                <>
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

          <ContactTasks contactId={contactId} onChanged={() => setTimelineKey((key) => key + 1)} />

                </>
              )}
              {tab === "campos" && (
                <>
          {customFieldDefs.length === 0 ? (
            <p className="text-xs text-muted-darker">Esta cuenta no tiene campos personalizados. Un administrador puede crearlos en Configuración.</p>
          ) : (
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

                </>
              )}
            </div>
          </HeroTabs>
        </div>
      )}
              </div>
              {contact && (
                <div className="flex shrink-0 items-center gap-2 border-t border-border bg-surface px-5 py-3">
                  <Button size="sm" variant="secondary" icon={CalendarClock} onClick={() => setAppointmentModalOpen(true)}>
                    Agendar cita
                  </Button>
                  {!inChat && contact.chat?.id && contact.accountId && (
                    <Link
                      href={`/whatsapp/chat/${contact.accountId}/${contact.chat.id}`}
                      className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-accent-ink hover:underline"
                    >
                      <MessageSquare size={14} aria-hidden /> Abrir chat
                    </Link>
                  )}
                </div>
              )}
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
