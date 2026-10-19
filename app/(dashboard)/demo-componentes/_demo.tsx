"use client";

import { useEffect, useState } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { Drawer } from "@base-ui/react/drawer";
import { Command } from "cmdk";
import { Group, Panel, Separator } from "react-resizable-panels";
import { ArrowLeft, ChevronDown, Command as CommandIcon, GripVertical, MessageSquare, PanelRight, Search, Send, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
import { cn } from "@/app/components/ui/cn";
import "./demo.css";

type Contact = {
  id: string;
  name: string;
  initials: string;
  company: string;
  channel: string;
  color: string;
  last: string;
  time: string;
  unread: number;
  stage: string;
  note: string;
};

const CONTACTS: Contact[] = [
  { id: "sofia", name: "Sofía Ramírez", initials: "SR", company: "Casa Nómada", channel: "WhatsApp", color: "bg-accent-subtle text-accent-ink", last: "Perfecto, ¿podemos agendar para mañana?", time: "12:42", unread: 2, stage: "Oportunidad", note: "Interesada en automatizar las consultas de su tienda." },
  { id: "diego", name: "Diego Martínez", initials: "DM", company: "Studio Norte", channel: "Instagram", color: "bg-rose-100 text-rose-700", last: "¿Me compartes los planes?", time: "11:18", unread: 1, stage: "Nuevo", note: "Llegó desde una campaña de Instagram." },
  { id: "valeria", name: "Valeria Torres", initials: "VT", company: "Luna Dental", channel: "Messenger", color: "bg-sky-100 text-sky-700", last: "Muchas gracias, quedo pendiente.", time: "Ayer", unread: 0, stage: "En seguimiento", note: "Quiere reducir el tiempo de respuesta de su equipo." },
  { id: "andres", name: "Andrés López", initials: "AL", company: "Taller Oliva", channel: "Telegram", color: "bg-emerald-100 text-emerald-700", last: "Nos vemos el jueves.", time: "Ayer", unread: 0, stage: "Cliente", note: "Tiene una demostración programada para el jueves." },
];

const INITIAL_MESSAGES: Record<string, { from: "contact" | "team"; text: string; time: string }[]> = {
  sofia: [
    { from: "contact", text: "Hola, vi su página y me interesa automatizar las preguntas frecuentes de mi tienda.", time: "12:31" },
    { from: "team", text: "¡Hola, Sofía! Claro. Podemos mostrarte cómo funcionan los bots y la bandeja compartida.", time: "12:36" },
    { from: "contact", text: "Perfecto, ¿podemos agendar para mañana?", time: "12:42" },
  ],
  diego: [{ from: "contact", text: "Hola. Tenemos bastantes mensajes en Instagram. ¿Me compartes los planes?", time: "11:18" }],
  valeria: [{ from: "team", text: "Te envío un resumen de las opciones para tu consultorio.", time: "Ayer" }, { from: "contact", text: "Muchas gracias, quedo pendiente.", time: "Ayer" }],
  andres: [{ from: "contact", text: "Nos vemos el jueves.", time: "Ayer" }],
};

const NAMES = CONTACTS.map((contact) => contact.name);

export function DemoComponentes({ embedded = false }: { embedded?: boolean }) {
  const [selectedId, setSelectedId] = useState(CONTACTS[0].id);
  const [commandOpen, setCommandOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const selected = CONTACTS.find((contact) => contact.id === selectedId) ?? CONTACTS[0];

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  function selectContact(id: string) {
    setSelectedId(id);
    setMobileChatOpen(true);
    setCommandOpen(false);
  }

  function sendMessage() {
    const text = draft.trim();
    if (!text) return;
    setMessages((current) => ({ ...current, [selectedId]: [...(current[selectedId] ?? []), { from: "team", text, time: new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) }] }));
    setDraft("");
  }

  function focusContactSearch() {
    setCommandOpen(false);
    setMobileChatOpen(false);
    window.setTimeout(() => {
      const inputs = document.querySelectorAll<HTMLInputElement>('[aria-label="Buscar contacto en la demo"]');
      [...inputs].find((input) => input.getClientRects().length > 0)?.focus();
    }, 50);
  }

  const conversation = (mobile = false) => (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <div className="flex h-[76px] shrink-0 items-center gap-3 border-b border-border px-4 md:px-6">
        {mobile && <button type="button" onClick={() => setMobileChatOpen(false)} aria-label="Volver a conversaciones" className="rounded-[12px] p-2 text-muted hover:bg-surface-light"><ArrowLeft size={18} /></button>}
        <Avatar contact={selected} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{selected.name}</p>
          <p className="text-xs text-muted">{selected.company} · {selected.channel}</p>
        </div>
        <button type="button" onClick={() => setDetailsOpen(true)} className="rounded-[12px] border border-border p-2.5 text-muted hover:bg-surface-light xl:hidden" aria-label="Ver ficha del contacto"><PanelRight size={18} /></button>
        <span className="hidden rounded-[12px] bg-success-bg px-2.5 py-1 text-xs font-medium text-success sm:block">En línea</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto bg-background/50 px-4 py-6 md:px-8">
        <p className="mx-auto rounded-full bg-surface-light px-3 py-1 text-[11px] text-muted">Hoy</p>
        {(messages[selectedId] ?? []).map((message, index) => (
          <div key={`${selectedId}-${index}`} className={cn("max-w-[84%] rounded-[16px] px-4 py-3 shadow-sm md:max-w-[70%]", message.from === "team" ? "ml-auto rounded-br-[5px] bg-accent text-on-accent" : "mr-auto rounded-bl-[5px] border border-border bg-surface text-foreground")}>
            <p className="text-sm leading-relaxed">{message.text}</p>
            <p className={cn("mt-1 text-right text-[10px]", message.from === "team" ? "text-on-accent/70" : "text-muted-darker")}>{message.time}</p>
          </div>
        ))}
      </div>
      <form onSubmit={(event) => { event.preventDefault(); sendMessage(); }} className="flex shrink-0 items-center gap-2 border-t border-border bg-surface p-3 md:p-4">
        <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Escribe una respuesta de prueba..." aria-label="Respuesta de prueba" className="min-w-0 flex-1 rounded-[12px] border border-border bg-surface-light px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-darker focus:border-accent-strong" />
        <button type="submit" disabled={!draft.trim()} aria-label="Enviar respuesta de prueba" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-accent text-on-accent disabled:opacity-40"><Send size={17} /></button>
      </form>
    </div>
  );

  const contactList = (mobile = false) => (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <div className="border-b border-border px-4 pb-4 pt-5">
        <div className="mb-4 flex items-center justify-between">
          <div><p className="text-base font-semibold text-foreground">Conversaciones</p><p className="text-xs text-muted">4 conversaciones de ejemplo</p></div>
          <span className="rounded-[12px] bg-accent-subtle px-2.5 py-1 text-xs font-semibold text-accent-ink">4</span>
        </div>
        <div className="mb-3">
          <Combobox.Root items={NAMES} onValueChange={(name) => { const contact = CONTACTS.find((item) => item.name === name); if (contact) selectContact(contact.id); }}>
            <Combobox.InputGroup className="flex h-10 items-center gap-2 rounded-[12px] border border-border bg-surface-light px-3 focus-within:border-accent-strong">
              <Search size={16} className="shrink-0 text-muted" />
              <Combobox.Input aria-label="Buscar contacto en la demo" placeholder="Encontrar un contacto..." className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-darker" />
              <Combobox.Trigger aria-label="Mostrar contactos" className="text-muted"><ChevronDown size={15} /></Combobox.Trigger>
            </Combobox.InputGroup>
            <Combobox.Portal>
              <Combobox.Positioner sideOffset={5} className="z-[60] w-[var(--anchor-width)]">
                <Combobox.Popup className="overflow-hidden rounded-[12px] border border-border bg-surface p-1.5 shadow-lg">
                  <Combobox.Empty className="px-3 py-3 text-sm text-muted">No encontramos ese contacto.</Combobox.Empty>
                  <Combobox.List>
                    {(name: string) => {
                      const contact = CONTACTS.find((item) => item.name === name)!;
                      return <Combobox.Item key={contact.id} value={name} className="flex cursor-pointer items-center gap-2 rounded-[9px] px-2.5 py-2 text-sm text-foreground outline-none data-[highlighted]:bg-accent-subtle"><Avatar contact={contact} small /><span className="flex-1">{name}</span><span className="text-xs text-muted">{contact.channel}</span></Combobox.Item>;
                    }}
                  </Combobox.List>
                </Combobox.Popup>
              </Combobox.Positioner>
            </Combobox.Portal>
          </Combobox.Root>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {CONTACTS.map((contact) => <button type="button" key={contact.id} onClick={() => selectContact(contact.id)} className={cn("flex w-full gap-3 rounded-[12px] p-3 text-left transition-colors", selectedId === contact.id ? "bg-accent-subtle" : "hover:bg-surface-light")}><Avatar contact={contact} /><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-semibold text-foreground">{contact.name}</span><span className="shrink-0 text-[10px] text-muted">{contact.time}</span></span><span className="mt-0.5 block truncate text-xs text-muted">{contact.company} · {contact.channel}</span><span className="mt-2 flex items-center justify-between gap-2"><span className="truncate text-xs text-muted">{contact.last}</span>{contact.unread > 0 && <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-on-accent">{contact.unread}</span>}</span></span></button>)}
      </div>
      {mobile && <div className="border-t border-border p-4 text-center text-xs text-muted">Selecciona una conversación para verla</div>}
    </div>
  );

  const details = () => <div className="h-full overflow-y-auto bg-surface p-5"><div className="flex items-center justify-between"><p className="text-sm font-semibold text-foreground">Ficha del contacto</p><button type="button" onClick={() => setDetailsOpen(false)} className="rounded-[12px] p-2 text-muted hover:bg-surface-light xl:hidden" aria-label="Cerrar ficha"><X size={17} /></button></div><div className="mt-8 flex flex-col items-center text-center"><Avatar contact={selected} large /><p className="mt-3 text-base font-semibold text-foreground">{selected.name}</p><p className="text-xs text-muted">{selected.company}</p><Badge className="mt-3" tone="success">{selected.stage}</Badge></div><div className="mt-8 space-y-5 border-t border-border pt-5"><Detail label="Canal" value={selected.channel} /><Detail label="Responsable" value="Mariana López" /><Detail label="Última actividad" value={selected.time} /><div><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-darker">Nota</p><p className="mt-2 rounded-[12px] bg-surface-light p-3 text-xs leading-relaxed text-muted">{selected.note}</p></div></div></div>;

  return <div className="mx-auto flex max-w-[1540px] flex-col gap-5">
    {!embedded && <div className="order-1 flex flex-wrap items-start justify-between gap-4"><div><div className="mb-2 flex items-center gap-2"><span className="rounded-[8px] bg-accent-subtle px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-accent-ink">Demo interactiva</span><span className="text-xs text-muted">Datos ficticios · solo desarrollo</span></div><h1 className="font-display text-2xl font-bold text-foreground md:text-3xl">Una bandeja Colibly más flexible</h1><p className="mt-1 max-w-2xl text-sm text-muted">Prueba las cuatro ideas en una sola pantalla: busca un contacto, ajusta las columnas y abre el menú de acciones. En móvil, consulta la ficha deslizable.</p></div><Button variant="secondary" icon={CommandIcon} onClick={() => setCommandOpen(true)}>Acciones rápidas <kbd className="ml-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted">⌘ K</kbd></Button></div>}
    {!embedded && <div className="order-3 grid gap-2 text-xs text-muted sm:grid-cols-2 xl:grid-cols-4"><Feature icon={Search} label="Buscador inteligente" text="Escribe un nombre y selecciónalo." /><Feature icon={GripVertical} label="Columnas ajustables" text="Arrastra los divisores en escritorio." /><Feature icon={CommandIcon} label="Acciones rápidas" text="Pulsa Ctrl/⌘ + K." /><Feature icon={PanelRight} label="Ficha móvil" text="Ábrela y deslízala para cerrar." /></div>}
    <div className="order-2 overflow-hidden rounded-[16px] border border-border bg-surface shadow-md"><div className="flex items-center justify-between border-b border-border bg-surface px-4 py-3"><div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-accent text-on-accent"><MessageSquare size={16} /></span><span className="text-sm font-semibold text-foreground">Bandeja de Chats</span><span className="hidden text-xs text-muted sm:inline">/ vista previa</span></div><button type="button" onClick={() => setCommandOpen(true)} className="flex items-center gap-1.5 rounded-[12px] border border-border px-2.5 py-1.5 text-xs text-muted hover:bg-surface-light"><SlidersHorizontal size={14} /> Acciones</button></div>
      <div className="hidden h-[min(68vh,700px)] min-h-[510px] md:block xl:hidden"><Group orientation="horizontal" className="h-full"><Panel defaultSize="36%" minSize="30%" maxSize="48%">{contactList()}</Panel><Separator aria-label="Ajustar ancho de conversaciones" className="group relative w-2 bg-background hover:bg-accent-subtle focus-visible:bg-accent-subtle"><span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border group-hover:bg-accent-strong" /></Separator><Panel defaultSize="64%" minSize="42%">{conversation()}</Panel></Group></div>
      <div className="hidden h-[min(68vh,700px)] min-h-[510px] xl:block"><Group orientation="horizontal" className="h-full"><Panel defaultSize="29%" minSize="23%" maxSize="42%">{contactList()}</Panel><Separator aria-label="Ajustar ancho de conversaciones" className="group relative w-2 bg-background hover:bg-accent-subtle focus-visible:bg-accent-subtle"><span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border group-hover:bg-accent-strong" /></Separator><Panel defaultSize="49%" minSize="32%">{conversation()}</Panel><Separator aria-label="Ajustar ancho de la ficha" className="group relative w-2 bg-background hover:bg-accent-subtle focus-visible:bg-accent-subtle"><span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border group-hover:bg-accent-strong" /></Separator><Panel defaultSize="22%" minSize="19%" maxSize="30%">{details()}</Panel></Group></div>
      <div className="h-[min(68vh,630px)] min-h-[500px] md:hidden">{mobileChatOpen ? conversation(true) : contactList(true)}</div>
    </div>
    <p className="order-4 text-xs text-muted">Esta demo no consulta APIs ni guarda mensajes. Cualquier respuesta que escribas desaparece al recargar.</p>

    <Command.Dialog open={commandOpen} onOpenChange={setCommandOpen} label="Acciones rápidas de la demo" contentClassName="colibly-demo-command" overlayClassName="colibly-demo-command-overlay"><Command.Input autoFocus placeholder="Buscar contacto o acción..." aria-label="Buscar una acción" /><Command.List><Command.Empty>Sin resultados.</Command.Empty><Command.Group heading="Conversaciones">{CONTACTS.map((contact) => <Command.Item key={contact.id} value={`Abrir ${contact.name} ${contact.company}`} onSelect={() => selectContact(contact.id)}><Avatar contact={contact} small /><span>Abrir {contact.name}</span><span className="ml-auto text-xs text-muted">{contact.channel}</span></Command.Item>)}</Command.Group><Command.Group heading="Vista"><Command.Item value="Ver ficha del contacto" onSelect={() => { setDetailsOpen(true); setCommandOpen(false); }}><PanelRight size={16} /><span>Ver ficha de {selected.name}</span></Command.Item><Command.Item value="Buscar en conversaciones" onSelect={focusContactSearch}><Search size={16} /><span>Buscar contacto</span></Command.Item></Command.Group></Command.List><div className="border-t border-border px-4 py-2 text-right text-[11px] text-muted">↑ ↓ para navegar · Enter para elegir · Esc para cerrar</div></Command.Dialog>

    <Drawer.Root open={detailsOpen} onOpenChange={setDetailsOpen} swipeDirection="right"><Drawer.Portal><Drawer.Backdrop className="colibly-demo-drawer-backdrop" /><Drawer.Viewport className="colibly-demo-drawer-viewport"><Drawer.Popup className="colibly-demo-drawer-popup"><Drawer.Content className="h-full"><Drawer.Title className="sr-only">Ficha de {selected.name}</Drawer.Title>{details()}</Drawer.Content></Drawer.Popup></Drawer.Viewport></Drawer.Portal></Drawer.Root>
  </div>;
}

function Avatar({ contact, small = false, large = false }: { contact: Contact; small?: boolean; large?: boolean }) { return <span className={cn("flex shrink-0 items-center justify-center rounded-[12px] font-bold", contact.color, large ? "h-16 w-16 text-lg" : small ? "h-7 w-7 text-[10px]" : "h-11 w-11 text-xs")}>{contact.initials}</span>; }
function Detail({ label, value }: { label: string; value: string }) { return <div><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-darker">{label}</p><p className="mt-1 text-sm text-foreground">{value}</p></div>; }
function Feature({ icon: Icon, label, text }: { icon: typeof Search; label: string; text: string }) { return <div className="flex items-start gap-2.5 rounded-[12px] border border-border bg-surface px-3 py-2.5"><Icon size={16} className="mt-0.5 shrink-0 text-accent-ink" /><div><p className="font-semibold text-foreground">{label}</p><p className="mt-0.5 text-muted">{text}</p></div></div>; }
