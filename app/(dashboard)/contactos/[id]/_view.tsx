"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Archive, ArchiveRestore, Building2, TriangleAlert, CalendarClock, Mail, MessageSquare, MoreHorizontal, Pencil, Phone, Trash2, UserRound } from "lucide-react";
import { Alert } from "@/app/components/kit/alert";
import { AlertDialog, AlertDialogClose, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogPopup, AlertDialogTitle } from "@/app/components/kit/alert-dialog";
import { Badge } from "@/app/components/kit/badge";
import { Button } from "@/app/components/kit/button";
import { Card, CardAction, CardHeader, CardPanel, CardTitle } from "@/app/components/kit/card";
import { Field, FieldLabel } from "@/app/components/kit/field";
import { Input } from "@/app/components/kit/input";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "@/app/components/kit/menu";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/app/components/kit/tabs";
import { useToast } from "@/app/components/ui/toast";
import { ContactAvatar } from "@/app/components/crm/contact-avatar";
import { EntityPicker, createCompanyOption, searchCompanies, type PickerOption } from "@/app/components/crm/entity-picker";
import { LIFECYCLE_OPTIONS } from "@/app/components/crm/person-form-dialog";
import { PersonDeals, type PersonDeal } from "@/app/components/crm/person-deals";
import { PersonNotes } from "@/app/components/crm/person-notes";
import { PersonTasks } from "@/app/components/crm/person-tasks";
import { SimpleSelect } from "@/app/components/crm/simple-select";
import { Timeline } from "@/app/components/crm/timeline";
import { usePipelines, useTeam } from "@/app/components/crm/use-crm-lookups";
import { AppointmentFormModal } from "@/app/components/whatsapp/appointment-form-modal";
import { CHANNELS, ChannelGlyph } from "@/app/components/whatsapp/channel-meta";
import type { Channel } from "@/app/components/whatsapp/chat-shared";
import { cn } from "@/app/components/kit/utils";
import { sourceLabel } from "@/lib/crm/labels";
import { formatPhoneDisplay } from "@/lib/phone";
import { formatMoney } from "@/lib/pipeline/format";

export interface PersonDetail {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  lifecycle: "LEAD" | "CUSTOMER";
  source: string | null;
  version: number;
  archivedAt: string | null;
  createdAt: string;
  companyId: string | null;
  ownerId: string | null;
  company: { id: string; name: string } | null;
  owner: { id: string; name: string | null } | null;
  canEdit: boolean;
  contacts: Array<{
    id: string;
    accountId: string | null;
    channelAccountId: string | null;
    remoteJid: string;
    name: string | null;
    optedOutMarketing: boolean;
    channel: Channel;
    accountName: string | null;
    thread: { kind: "whatsapp" | "channel"; id: string; status: string; lastMessageAt: string | null; unreadCount: number } | null;
    tags: Array<{ id: string; name: string; color: string }>;
  }>;
  deals: PersonDeal[];
  upcomingAppointments: Array<{ id: string; title: string; scheduledAt: string; durationMinutes: number; contactId: string }>;
}

const THREAD_STATUS: Record<string, string> = { OPEN: "Abierto", PENDING: "Pendiente", RESOLVED: "Resuelto" };

function Row({ icon: Icon, children, empty }: { icon: React.ElementType; children?: React.ReactNode; empty?: string }) {
  return (
    <div className="flex items-start gap-2.5 text-sm">
      <Icon size={14} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className={cn("min-w-0 flex-1 break-words", !children && "text-muted-foreground")}>{children ?? empty}</div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p suppressHydrationWarning className="mt-1 truncate font-display text-xl font-semibold tabular-nums">{value}</p>
      {hint && <p suppressHydrationWarning className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function relative(iso: string | null): { value: string; hint?: string } {
  if (!iso) return { value: "—" };
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(ms / 3_600_000);
  const hint = new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
  if (hours < 1) return { value: "Hace minutos", hint };
  if (hours < 24) return { value: `Hace ${hours} h`, hint };
  return { value: `Hace ${Math.floor(hours / 24)} d`, hint };
}

export function PersonView({ initial }: { initial: PersonDetail }) {
  const router = useRouter();
  const { success, error: toastError } = useToast();
  const { data: session } = useSession();
  const role = session?.user?.role;
  const canManage = role === "admin" || role === "user";
  const [person, setPerson] = useState<PersonDetail>(initial);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [timelineKey, setTimelineKey] = useState(0);
  const [appointmentOpen, setAppointmentOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const { currency } = usePipelines();
  const team = useTeam(editing && canManage);

  // Campos del formulario de datos.
  const [name, setName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [lifecycle, setLifecycle] = useState("LEAD");
  const [ownerId, setOwnerId] = useState("");
  const [company, setCompany] = useState<PickerOption | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/crm/people/${initial.id}`);
    if (res.ok) setPerson((await res.json()) as PersonDetail);
    setTimelineKey((k) => k + 1);
  }, [initial.id]);

  function startEdit() {
    setName(person.name);
    setJobTitle(person.jobTitle ?? "");
    setEmail(person.email ?? "");
    setPhone(person.phone ?? "");
    setLifecycle(person.lifecycle);
    setOwnerId(person.ownerId ?? "");
    setCompany(person.company ? { id: person.company.id, label: person.company.name } : null);
    setFormError("");
    setEditing(true);
  }

  async function save() {
    setFormError("");
    if (!name.trim()) return setFormError("Indica el nombre");
    const body: Record<string, unknown> = { expectedVersion: person.version };
    if (name.trim() !== person.name) body.name = name.trim();
    if ((jobTitle.trim() || null) !== person.jobTitle) body.jobTitle = jobTitle.trim() || null;
    if ((email.trim() || null) !== person.email) body.email = email.trim() || null;
    if ((phone.trim() || null) !== person.phone) body.phone = phone.trim() || null;
    if (lifecycle !== person.lifecycle) body.lifecycle = lifecycle;
    if (canManage && (ownerId || null) !== person.ownerId) body.ownerId = ownerId || null;
    if ((company?.id ?? null) !== person.companyId) body.companyId = company?.id ?? null;
    if (Object.keys(body).length === 1) return setEditing(false);

    setSaving(true);
    try {
      const res = await fetch(`/api/crm/people/${person.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (res.status === 409 && data.code === "version_conflict") {
        setEditing(false);
        toastError("Alguien más modificó este contacto. Se cargó la versión actual: vuelve a aplicar tu cambio.");
        await refresh();
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar");
      success("Contacto actualizado");
      setEditing(false);
      await refresh();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  async function setArchived(archived: boolean) {
    setBusy(true);
    try {
      const res = await fetch(`/api/crm/people/${person.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedVersion: person.version, archived }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo actualizar");
      success(archived ? "Contacto archivado" : "Contacto restaurado");
      await refresh();
    } catch (e) {
      toastError(e instanceof Error ? e.message : "No se pudo actualizar");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const res = await fetch(`/api/crm/people/${person.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo eliminar");
      success("Contacto eliminado");
      router.push("/contactos");
    } catch (e) {
      toastError(e instanceof Error ? e.message : "No se pudo eliminar");
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  const archived = !!person.archivedAt;
  const threads = person.contacts.filter((c) => c.thread);
  const primary = person.contacts[0] ?? null;
  const openValue = useMemo(() => person.deals.filter((d) => d.status === "OPEN").reduce((n, d) => n + d.amount, 0), [person.deals]);
  const wonValue = useMemo(() => person.deals.filter((d) => d.status === "WON").reduce((n, d) => n + d.amount, 0), [person.deals]);
  const lastMessageAt = useMemo(
    () => person.contacts.map((c) => c.thread?.lastMessageAt).filter((x): x is string => !!x).sort().at(-1) ?? null,
    [person.contacts]
  );
  const last = relative(lastMessageAt);
  const openDeals = person.deals.filter((d) => d.status === "OPEN").length;
  const unread = person.contacts.reduce((n, c) => n + (c.thread?.unreadCount ?? 0), 0);
  const optedOut = person.contacts.some((c) => c.optedOutMarketing);

  const chatHref = (c: PersonDetail["contacts"][number]) => `/whatsapp/chat/${c.accountId ?? c.channelAccountId}/${c.thread!.id}`;
  const identityLabel = (c: PersonDetail["contacts"][number]) => `${CHANNELS[c.channel].label} · ${c.accountName ?? "—"}`;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {archived && (
        <Alert variant="warning">
          <TriangleAlert />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p>Este contacto está archivado: no aparece en listas ni cuenta para tu plan.</p>
            {canManage && <Button size="sm" variant="outline" onClick={() => setArchived(false)} loading={busy}><ArchiveRestore /> Restaurar</Button>}
          </div>
        </Alert>
      )}

      <header className="flex flex-wrap items-start gap-4">
        <ContactAvatar id={person.id} name={person.name} size="lg" />
        <div className="min-w-0 flex-1 basis-64">
          <p className="mb-1 text-eyebrow font-medium uppercase tracking-wider text-muted-foreground">Contacto</p>
          <h1 className="truncate font-display text-page-title font-semibold tracking-tight">{person.name}</h1>
          {(person.jobTitle || person.company) && <p className="mt-0.5 truncate text-sm text-muted-foreground">{[person.jobTitle, person.company?.name].filter(Boolean).join(" · ")}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge variant={person.lifecycle === "CUSTOMER" ? "success" : "info"}>{person.lifecycle === "CUSTOMER" ? "Cliente" : "Prospecto"}</Badge>
            {archived && <Badge variant="warning">Archivado</Badge>}
            {optedOut && <Badge variant="warning">Sin marketing</Badge>}
            {unread > 0 && <Badge variant="default">{unread} sin leer</Badge>}
            {person.contacts.map((c) => (
              <Badge key={c.id} variant="outline"><ChannelGlyph channel={c.channel} size={11} /> {CHANNELS[c.channel].label}</Badge>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {threads.length === 1 && (
            <Button render={<Link href={chatHref(threads[0])} />}><MessageSquare /> Abrir chat</Button>
          )}
          {threads.length > 1 && (
            <Menu>
              <MenuTrigger render={<Button />}><MessageSquare /> Abrir chat</MenuTrigger>
              <MenuPopup align="end">
                {threads.map((c) => <MenuItem key={c.id} render={<Link href={chatHref(c)} />}>{identityLabel(c)}</MenuItem>)}
              </MenuPopup>
            </Menu>
          )}
          <Menu>
            <MenuTrigger render={<Button variant="outline" size="icon" aria-label="Más acciones" />}><MoreHorizontal /></MenuTrigger>
            <MenuPopup align="end" className="min-w-52">
              <MenuItem disabled={!primary} onClick={() => setAppointmentOpen(true)}><CalendarClock /> Agendar cita</MenuItem>
              {person.canEdit && <MenuItem onClick={startEdit}><Pencil /> Editar datos</MenuItem>}
              {canManage && (
                <>
                  <MenuSeparator />
                  <MenuItem onClick={() => setArchived(!archived)}>{archived ? <><ArchiveRestore /> Restaurar</> : <><Archive /> Archivar</>}</MenuItem>
                </>
              )}
              {role === "admin" && <MenuItem variant="destructive" onClick={() => setConfirmDelete(true)}><Trash2 /> Eliminar definitivamente</MenuItem>}
            </MenuPopup>
          </Menu>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Valor en juego" value={formatMoney(openValue, currency)} hint={`${openDeals} ${openDeals === 1 ? "negocio abierto" : "negocios abiertos"}`} />
        <Stat label="Ganado" value={formatMoney(wonValue, currency)} hint={`${person.deals.filter((d) => d.status === "WON").length} ${person.deals.filter((d) => d.status === "WON").length === 1 ? "negocio ganado" : "negocios ganados"}`} />
        <Stat label="Último mensaje" value={last.value} hint={last.hint ?? (person.contacts.length ? "Sin mensajes todavía" : "Sin canales visibles")} />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Datos</CardTitle>
              {person.canEdit && !editing && (
                <CardAction><Button size="xs" variant="ghost" onClick={startEdit}><Pencil /> Editar</Button></CardAction>
              )}
            </CardHeader>
            <CardPanel>
              {editing ? (
                <form onSubmit={(e) => { e.preventDefault(); void save(); }} className="space-y-3.5">
                  {formError && <Alert variant="error">{formError}</Alert>}
                  <Field><FieldLabel>Nombre</FieldLabel><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} autoFocus /></Field>
                  <Field><FieldLabel>Puesto</FieldLabel><Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} maxLength={120} /></Field>
                  <Field>
                    <FieldLabel>Empresa</FieldLabel>
                    <div className="w-full"><EntityPicker ariaLabel="Empresa" value={company} onChange={setCompany} search={searchCompanies} onCreate={createCompanyOption} placeholder="Buscar o crear empresa" /></div>
                  </Field>
                  <Field><FieldLabel>Correo</FieldLabel><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} /></Field>
                  <Field><FieldLabel>Teléfono</FieldLabel><Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} /></Field>
                  <Field><FieldLabel>Tipo</FieldLabel><SimpleSelect ariaLabel="Tipo de contacto" value={lifecycle} onChange={setLifecycle} options={LIFECYCLE_OPTIONS} /></Field>
                  {canManage && (
                    <Field>
                      <FieldLabel>Responsable</FieldLabel>
                      <SimpleSelect ariaLabel="Responsable" value={ownerId} onChange={setOwnerId} options={[{ value: "", label: "Sin responsable" }, ...team.map((u) => ({ value: u.id, label: u.name ?? u.email }))]} />
                    </Field>
                  )}
                  <div className="flex justify-end gap-2 pt-1">
                    <Button type="button" variant="outline" size="sm" onClick={() => setEditing(false)} disabled={saving}>Cancelar</Button>
                    <Button type="submit" size="sm" loading={saving}>Guardar</Button>
                  </div>
                </form>
              ) : (
                <div className="space-y-2.5">
                  <Row icon={Phone} empty="Sin teléfono">{person.phone ? <span className="tabular-nums">{formatPhoneDisplay(person.phone)}</span> : null}</Row>
                  <Row icon={Mail} empty="Sin correo">{person.email}</Row>
                  <Row icon={Building2} empty="Sin empresa">{person.company?.name}</Row>
                  <Row icon={UserRound} empty="Sin responsable">{person.owner?.name ? `Responsable: ${person.owner.name}` : null}</Row>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-t pt-3 text-xs">
                    <div><dt className="text-muted-foreground">Origen</dt><dd className="mt-0.5 font-medium">{sourceLabel(person.source)}</dd></div>
                    <div><dt className="text-muted-foreground">Creado</dt><dd suppressHydrationWarning className="mt-0.5 font-medium">{new Date(person.createdAt).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })}</dd></div>
                  </dl>
                  {!person.canEdit && <p className="text-xs text-muted-foreground">Solo el responsable puede editar este contacto.</p>}
                </div>
              )}
            </CardPanel>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Canales</CardTitle></CardHeader>
            <CardPanel>
              {person.contacts.length === 0 ? (
                <p className="text-sm text-muted-foreground">Este contacto no tiene canales que puedas ver. Cuando escriba por una cuenta a la que tienes acceso, su chat aparecerá aquí.</p>
              ) : (
                <ul className="space-y-3">
                  {person.contacts.map((c) => (
                    <li key={c.id} className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-light text-muted-foreground"><ChannelGlyph channel={c.channel} size={13} /></span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{identityLabel(c)}</p>
                          <p className="truncate text-xs text-muted-foreground tabular-nums">{c.channel === "WHATSAPP" || c.channel === "TELEGRAM" ? (/^\d{7,}$/.test(c.remoteJid) ? formatPhoneDisplay(c.remoteJid) : c.name ?? c.remoteJid) : c.name ?? c.remoteJid}</p>
                        </div>
                        {c.thread && c.thread.unreadCount > 0 && <Badge size="sm" className="rounded-full tabular-nums">{c.thread.unreadCount}</Badge>}
                        {c.thread && <Button size="xs" variant="outline" render={<Link href={chatHref(c)} />}>Abrir</Button>}
                      </div>
                      {c.thread && <p className="pl-9 text-xs text-muted-foreground">{THREAD_STATUS[c.thread.status] ?? c.thread.status}</p>}
                      {c.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 pl-9">{c.tags.map((t) => <Badge key={t.id} size="sm" variant="secondary">{t.name}</Badge>)}</div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardPanel>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Próximas citas</CardTitle>
              <CardAction><Button size="xs" variant="ghost" disabled={!primary} onClick={() => setAppointmentOpen(true)}>Agendar</Button></CardAction>
            </CardHeader>
            <CardPanel>
              {person.upcomingAppointments.length === 0 ? (
                <p className="text-sm text-muted-foreground">{primary ? "Sin citas próximas." : "Las citas se agendan sobre un canal del contacto."}</p>
              ) : (
                <ul className="space-y-2.5">
                  {person.upcomingAppointments.map((a) => (
                    <li key={a.id} className="flex items-start gap-2.5">
                      <CalendarClock size={14} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{a.title}</p>
                        <p suppressHydrationWarning className="text-xs text-muted-foreground">{new Date(a.scheduledAt).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}</p>
                      </div>
                    </li>
                  ))}
                  <li><Link href={`/whatsapp/citas?contactId=${primary?.id ?? ""}`} className="text-xs font-medium text-accent-ink hover:underline">Ver agenda</Link></li>
                </ul>
              )}
            </CardPanel>
          </Card>
        </aside>

        <div className="min-w-0">
          <Tabs defaultValue="activity" className="gap-4">
            <div className="-mx-1 overflow-x-auto px-1">
              <TabsList variant="underline">
                <TabsTab value="activity">Actividad</TabsTab>
                <TabsTab value="deals">Negocios{person.deals.length ? ` (${person.deals.length})` : ""}</TabsTab>
                <TabsTab value="tasks">Tareas</TabsTab>
                <TabsTab value="notes">Notas</TabsTab>
              </TabsList>
            </div>
            <TabsPanel value="activity">
              <Card><CardPanel><Timeline personId={person.id} refreshKey={timelineKey} /></CardPanel></Card>
            </TabsPanel>
            <TabsPanel value="deals">
              <Card><CardPanel>
                <PersonDeals personId={person.id} personLabel={person.name} contactId={primary?.id} deals={person.deals} onChanged={() => void refresh()} />
              </CardPanel></Card>
            </TabsPanel>
            <TabsPanel value="tasks">
              <Card><CardPanel><PersonTasks personId={person.id} personLabel={person.name} onChanged={() => setTimelineKey((k) => k + 1)} /></CardPanel></Card>
            </TabsPanel>
            <TabsPanel value="notes">
              <Card><CardPanel>
                <PersonNotes identities={person.contacts.map((c) => ({ id: c.id, label: identityLabel(c) }))} onChanged={() => setTimelineKey((k) => k + 1)} />
              </CardPanel></Card>
            </TabsPanel>
          </Tabs>
        </div>
      </div>

      {primary && (
        <AppointmentFormModal open={appointmentOpen} onClose={() => setAppointmentOpen(false)} onSaved={() => void refresh()} contactId={primary.id} contactLabel={person.name} />
      )}

      <AlertDialog open={confirmDelete} onOpenChange={(o) => { if (!busy) setConfirmDelete(o); }}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar a {person.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borran de forma definitiva sus conversaciones, negocios, tareas y notas. No se puede deshacer. Si solo quieres ocultarlo, archívalo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" disabled={busy} />}>Cancelar</AlertDialogClose>
            <Button variant="destructive" loading={busy} onClick={() => void remove()}>Eliminar definitivamente</Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </div>
  );
}
