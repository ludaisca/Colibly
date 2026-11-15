"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronRight, ExternalLink, Plus } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Select } from "@/app/components/ui/select";
import { Textarea } from "@/app/components/ui/textarea";
import { useToast } from "@/app/components/ui/toast";
import { LEAD_STATUS_LABEL } from "@/app/components/ui/lead-status";
import { formatMxn } from "@/lib/money";
import { formatPhoneShort } from "@/lib/format/phone";
import { displayName } from "@/lib/chats/display-name";
import { ChatTagPicker } from "./chat-tag-picker";
import { ContactTimeline } from "./contact-timeline";
import { AppointmentFormModal } from "./appointment-form-modal";
import type { ChatItem } from "./chat-shared";

// Ficha derecha de Chats (288 px, dirección congelada nov 2026): secciones
// plegables — Contacto, Trato (etapa editable), Próxima cita, Notas e
// Historial. Lo demás (campos, tareas, edición completa) sigue en la ficha
// completa (ContactDrawer), que se abre desde "Ficha completa".

type LeadStatus = keyof typeof LEAD_STATUS_LABEL;

interface ContactData {
  id: string;
  name: string | null;
  remoteJid: string;
  leadStatus: LeadStatus;
  pipelineStageId: string | null;
  dealValueCents: number | null;
  expectedCloseAt: string | null;
}
interface Stage { id: string; name: string; leadStatus?: LeadStatus | null }
interface Pipeline { id: string; isDefault: boolean; stages: Stage[] }
interface Note { id: string; body: string; createdAt: string; author: { id: string; name: string | null } }
interface NextAppointment { id: string; title: string; scheduledAt: string }

function Section({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  return (
    <details open={defaultOpen} className="group border-b border-border">
      <summary className="flex h-10 cursor-pointer list-none items-center gap-1.5 px-4 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRight size={16} aria-hidden className="text-muted transition-transform duration-fast group-open:rotate-90 motion-reduce:transition-none" />
        {title}
      </summary>
      <div className="space-y-2 px-4 pb-4">{children}</div>
    </details>
  );
}

export function ChatContactPanel({ chat, onOpenFull, onChanged }: { chat: ChatItem; onOpenFull: () => void; onChanged: () => void }) {
  const contactId = chat.contactId!;
  const { error: toastError, success } = useToast();
  const [contact, setContact] = useState<ContactData | null>(null);
  const [stages, setStages] = useState<Stage[] | null>(null);
  const [next, setNext] = useState<NextAppointment | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [savingStage, setSavingStage] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [timelineKey, setTimelineKey] = useState(0);

  const load = useCallback(async () => {
    try {
      const [contactRes, notesRes, nextRes, pipelinesRes] = await Promise.all([
        fetch(`/api/whatsapp/contacts/${contactId}`),
        fetch(`/api/whatsapp/contacts/${contactId}/notes`),
        fetch(`/api/whatsapp/appointments?contactId=${contactId}&upcoming=true&limit=1`),
        // El rol ejecutivo no ve embudos (403): la etapa cae al estado del contacto.
        fetch("/api/pipelines"),
      ]);
      const contactData = await contactRes.json();
      if (!contactRes.ok) throw new Error(contactData.error ?? "No se pudo cargar el contacto");
      setContact(contactData);
      const notesData = await notesRes.json().catch(() => []);
      setNotes(Array.isArray(notesData) ? notesData : []);
      const nextData = await nextRes.json().catch(() => []);
      setNext(Array.isArray(nextData) ? nextData[0] ?? null : null);
      if (pipelinesRes.ok) {
        const pipelines = (await pipelinesRes.json()) as Pipeline[];
        const own = pipelines.find((pipeline) => pipeline.stages.some((stage) => stage.id === contactData.pipelineStageId))
          ?? pipelines.find((pipeline) => pipeline.isDefault);
        setStages(own?.stages.map(({ id, name, leadStatus }) => ({ id, name, leadStatus })) ?? null);
      } else {
        setStages(null);
      }
    } catch (error) {
      toastError(error instanceof Error ? error.message : "No se pudo cargar el contacto");
    }
  }, [contactId, toastError]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga al cambiar de chat; load también refresca tras guardar
    void load();
  }, [load]);

  async function patchContact(body: Record<string, unknown>) {
    setSavingStage(true);
    try {
      const res = await fetch(`/api/whatsapp/contacts/${contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar");
      await load();
      setTimelineKey((key) => key + 1);
      onChanged();
    } catch (error) {
      toastError(error instanceof Error ? error.message : "No se pudo guardar");
    } finally {
      setSavingStage(false);
    }
  }

  async function addNote() {
    const body = noteDraft.trim();
    if (!body) return;
    setSavingNote(true);
    try {
      const res = await fetch(`/api/whatsapp/contacts/${contactId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar la nota");
      setNotes((previous) => [data, ...previous]);
      setNoteDraft("");
      setTimelineKey((key) => key + 1);
      success("Nota guardada");
    } catch (error) {
      toastError(error instanceof Error ? error.message : "No se pudo guardar la nota");
    } finally {
      setSavingNote(false);
    }
  }

  const name = displayName(contact?.name ?? chat.name, chat.remoteJid);
  const phone = chat.channel === "WHATSAPP" ? formatPhoneShort(chat.remoteJid) : null;

  return (
    <aside aria-label="Ficha del contacto" className="hidden w-72 shrink-0 flex-col overflow-y-auto border-l border-border bg-surface xl:flex">
      <Section title="Contacto">
        <p className="truncate text-sm font-medium text-foreground">{name}</p>
        {phone && <p className="text-sm tabular-nums text-muted">{phone}</p>}
        <ChatTagPicker chatId={chat.id} />
        <button type="button" onClick={onOpenFull} className="inline-flex items-center gap-1 text-xs font-medium text-accent-ink hover:underline">
          Ficha completa <ExternalLink size={12} aria-hidden />
        </button>
      </Section>

      <Section title="Trato">
        {contact && (stages ? (
          <Select
            aria-label="Etapa"
            // Sin etapa propia: la del embudo principal que corresponde a su estado.
            value={contact.pipelineStageId ?? stages.find((stage) => stage.leadStatus === contact.leadStatus)?.id ?? ""}
            disabled={savingStage}
            placeholder="Sin etapa"
            onChange={(event) => { if (event.target.value) void patchContact({ pipelineStageId: event.target.value }); }}
          >
            {stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
          </Select>
        ) : (
          <Select aria-label="Etapa" value={contact.leadStatus} disabled={savingStage} onChange={(event) => void patchContact({ leadStatus: event.target.value })}>
            {(Object.keys(LEAD_STATUS_LABEL) as LeadStatus[]).map((status) => <option key={status} value={status}>{LEAD_STATUS_LABEL[status]}</option>)}
          </Select>
        ))}
        <p className="text-xs text-muted">
          {contact?.dealValueCents != null ? <span className="tabular-nums text-foreground">{formatMxn(contact.dealValueCents)}</span> : "Sin monto"}
          {contact?.expectedCloseAt && <> · cierre {new Date(contact.expectedCloseAt).toLocaleDateString("es-MX", { day: "numeric", month: "short", timeZone: "UTC" })}</>}
        </p>
      </Section>

      <Section title="Próxima cita">
        {next ? (
          <p className="text-sm text-foreground">
            {next.title}
            <span className="block text-xs tabular-nums text-muted">
              {new Date(next.scheduledAt).toLocaleString("es-MX", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </span>
          </p>
        ) : (
          <p className="text-sm text-muted">Sin citas próximas</p>
        )}
        <Button type="button" variant="ghost" size="sm" icon={Plus} onClick={() => setScheduling(true)}>Agendar cita</Button>
      </Section>

      <Section title="Notas" defaultOpen={false}>
        <Textarea value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} placeholder="Escribe una nota" rows={2} aria-label="Nueva nota" />
        <Button type="button" variant="secondary" size="sm" loading={savingNote} disabled={!noteDraft.trim()} onClick={() => void addNote()}>Guardar nota</Button>
        {notes.length === 0 ? (
          <p className="text-xs text-muted">Sin notas</p>
        ) : (
          <ul className="space-y-2">
            {notes.slice(0, 5).map((note) => (
              <li key={note.id} className="text-sm text-foreground">
                <p className="whitespace-pre-wrap break-words">{note.body}</p>
                <p className="text-xs text-muted">{note.author.name ?? "Alguien"} · {new Date(note.createdAt).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Historial" defaultOpen={false}>
        <ContactTimeline contactId={contactId} refreshKey={timelineKey} />
      </Section>

      {scheduling && (
        <AppointmentFormModal
          open
          onClose={() => setScheduling(false)}
          onSaved={() => { setScheduling(false); void load(); setTimelineKey((key) => key + 1); }}
          contactId={contactId}
          contactLabel={name}
        />
      )}
    </aside>
  );
}
