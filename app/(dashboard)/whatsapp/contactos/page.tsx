"use client";

import { displayName } from "@/lib/chats/display-name";
import { useState, useEffect, useCallback, useRef } from "react";
import { GettingStarted } from "@/app/components/ui/getting-started";
import { formatMxn } from "@/lib/money";
import Link from "next/link";
import { Search, RefreshCw, Upload, Contact as ContactIcon } from "lucide-react";
import { Input } from "@/app/components/ui/input";
import { FiltersPanel, type FilterFieldDef } from "@/app/components/ui/filters-panel";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { PageHeader } from "@/app/components/ui/page-header";
import { EntityList, EntityRow } from "@/app/components/ui/entity-list";
import { ChannelAvatar } from "@/app/components/ui/channel-avatar";
import { Pagination } from "@/app/components/ui/pagination";
import { useToast } from "@/app/components/ui/toast";
import { ContactDrawer } from "@/app/components/whatsapp/contact-drawer";
import { ContactImportModal } from "@/app/components/whatsapp/contact-import-modal";
import { ContactLimitBanner, ContactUsageMeter, useContactUsage } from "@/app/components/billing/contact-usage";

const PAGE_SIZE = 25;

interface AccountOption {
  id: string;
  name: string;
  phoneNumber: string | null;
  channel?: string;
}

interface ContactRow {
  id: string;
  accountId: string;
  remoteJid: string;
  name: string | null;
  leadStatus: string;
  updatedAt: string;
  tags: Array<{ tag: { id: string; name: string; color: string } }>;
  chat: { id: string; unreadCount: number; lastMessageAt: string | null } | null;
  _count: { notes: number };
  channel: "WHATSAPP" | "TELEGRAM" | "MESSENGER" | "INSTAGRAM" | "WEBCHAT";
}

function phoneFromJid(remoteJid: string): string {
  return remoteJid.split("@")[0];
}

const LEAD_STATUS_BADGE: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" | "info" | "accent" }> = {
  NEW: { label: "Nuevo", tone: "info" },
  CONTACTED: { label: "Contactado", tone: "warning" },
  QUALIFIED: { label: "Calificado", tone: "accent" },
  CUSTOMER: { label: "Cliente", tone: "success" },
  LOST: { label: "Perdido", tone: "danger" },
};

export default function ContactosPage() {
  const { error: toastError } = useToast();
  const contactUsage = useContactUsage();
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [leadStatusFilter, setLeadStatusFilter] = useState("");
  const [accountFilter, setAccountFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  // Pie de la tabla (F8): se pide con la página 1 (cada cambio de filtros
  // vuelve a ella) y se conserva al paginar.
  const [summary, setSummary] = useState<{ withoutTags: number; withoutConversation: number; withDeal: number; dealValueCents: number } | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Deep link del buscador global: /whatsapp/contactos?search=teléfono
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("search");
    if (!q) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lectura única de la URL al montar
    setSearchInput(q);
    setSearch(q);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset pagination when filters change
    setPage(1);
  }, [search, leadStatusFilter, accountFilter]);

  const fetchContacts = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setFetchError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (leadStatusFilter) params.set("leadStatus", leadStatusFilter);
      if (accountFilter) params.set("accountId", accountFilter);
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));
      if (page === 1) params.set("summary", "1");
      const res = await fetch(`/api/whatsapp/contacts?${params.toString()}`);
      const data = await res.json();
      if (res.ok && Array.isArray(data.items)) {
        if (currentRequest === requestId.current) {
          setContacts(data.items);
          setTotal(data.total ?? 0);
          if (data.summary) setSummary(data.summary);
        }
      } else throw new Error(data.error ?? "Error al cargar contactos");
    } catch (err) {
      if (currentRequest === requestId.current) setFetchError(err instanceof Error ? err.message : "Error al cargar contactos");
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [search, leadStatusFilter, accountFilter, page]);

  // Todos los canales en una sola lista — el selector filtra por id sin
  // importar de qué canal venga (la API resuelve la columna correcta).
  const fetchAccounts = useCallback(async () => {
    try {
      const endpoints = ["whatsapp", "telegram", "messenger", "instagram", "webchat"];
      const channelNames = ["WHATSAPP", "TELEGRAM", "MESSENGER", "INSTAGRAM", "WEBCHAT"];
      const results = await Promise.all(endpoints.map(async (channel) => {
        const res = await fetch(`/api/${channel}/accounts`);
        if (!res.ok) throw new Error("Error al cargar cuentas");
        const data: unknown = await res.json();
        if (!Array.isArray(data)) throw new Error("Respuesta inválida de cuentas");
        return data as Array<{ id: string; name: string; phoneNumber?: string | null }>;
      }));
      setAccounts(results.flatMap((rows, index) => rows.map((a) => ({
        id: a.id, name: a.name, phoneNumber: a.phoneNumber ?? null, channel: channelNames[index],
      }))));
    } catch {
      toastError("Error al cargar cuentas");
    }
  }, [toastError]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount/filter-change; fetchContacts also used for manual refresh
    fetchContacts();
  }, [fetchContacts]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    fetchAccounts();
  }, [fetchAccounts]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Contactos"
        description="Etiquetas, estado de lead y notas por contacto."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <ContactUsageMeter usage={contactUsage} />
            <Button variant="secondary" size="md" icon={Upload} onClick={() => setImportOpen(true)}>
              Importar CSV
            </Button>
            <Button variant="secondary" size="md" icon={RefreshCw} onClick={fetchContacts}>
              Actualizar
            </Button>
          </div>
        }
      />

      <ContactLimitBanner usage={contactUsage} />

      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Input
            icon={Search}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Buscar por nombre o identificador…"
            className="min-w-0 flex-1"
          />
          <FiltersPanel
            panelTitle="Filtrar contactos"
            fields={[
              ...(accounts.length > 1
                ? [{
                    key: "account",
                    label: "Cuenta",
                    options: [
                      { value: "", label: "Todas las cuentas" },
                      ...accounts.map((acc) => ({
                        value: acc.id,
                        label: acc.name + (acc.phoneNumber ? ` · ${acc.phoneNumber}` : ""),
                      })),
                    ],
                  } satisfies FilterFieldDef]
                : []),
              {
                key: "leadStatus",
                label: "Estado",
                options: [
                  { value: "", label: "Todos los estados" },
                  ...Object.entries(LEAD_STATUS_BADGE).map(([value, { label }]) => ({ value, label })),
                ],
              },
            ]}
            values={{ account: accountFilter, leadStatus: leadStatusFilter }}
            onApply={(v) => {
              setAccountFilter(v.account ?? "");
              setLeadStatusFilter(v.leadStatus ?? "");
            }}
          />
        </div>

        {!loading && !fetchError && contacts.length === 0 && !search && !leadStatusFilter && !accountFilter ? (
          <div className="rounded-lg border border-border bg-surface">
            <GettingStarted
              title="Aún no tienes contactos"
              description="Se crean solos cuando alguien te escribe por un canal conectado. También puedes importarlos de un CSV."
              memberHint="Los contactos aparecen cuando alguien escribe a una de tus cuentas. Si no ves ninguna, pide a un administrador que te comparta una cuenta."
              extraAction={
                <Button variant="secondary" size="sm" icon={Upload} onClick={() => setImportOpen(true)}>
                  Importar CSV
                </Button>
              }
            />
          </div>
        ) : (
        <EntityList
          rows={contacts}
          rowKey={(c) => c.id}
          loading={loading}
          error={fetchError}
          onRetry={fetchContacts}
          onRowClick={(c) => setSelectedId(c.id)}
          emptyIcon={ContactIcon}
          emptyTitle={search || leadStatusFilter || accountFilter ? "Sin resultados" : "Sin contactos"}
          emptyDescription={search || leadStatusFilter || accountFilter
            ? "No se encontraron contactos con la búsqueda o los filtros actuales."
            : "Los contactos se crean automáticamente cuando recibes mensajes en tus canales."}
          emptyAction={search || leadStatusFilter || accountFilter ? (
            <Button variant="secondary" size="sm" onClick={() => {
              setSearchInput("");
              setSearch("");
              setLeadStatusFilter("");
              setAccountFilter("");
            }}>Limpiar búsqueda y filtros</Button>
          ) : undefined}
          renderRow={(contact) => {
            const badge = LEAD_STATUS_BADGE[contact.leadStatus] ?? { label: contact.leadStatus, tone: "neutral" as const };
            const account = accounts.find((a) => a.id === contact.accountId);
            const name = displayName(contact.name, contact.remoteJid);
            return (
              <EntityRow
                leading={<ChannelAvatar id={contact.accountId} name={name} channel={contact.channel} size="sm" />}
                title={name}
                badges={
                  <span className="flex shrink-0 items-center gap-1">
                    <Badge tone={badge.tone} size="sm">{badge.label}</Badge>
                    {contact.tags.map(({ tag }) => (
                      <Badge key={tag.id} tone="accent" size="sm" className="hidden md:inline-flex">{tag.name}</Badge>
                    ))}
                  </span>
                }
                subtitle={
                  <>
                    {contact.channel === "WHATSAPP"
                      ? <span className="tabular-nums">{phoneFromJid(contact.remoteJid)}</span>
                      : <span>{contact.channel === "WEBCHAT" ? "Chat web" : contact.channel.charAt(0) + contact.channel.slice(1).toLowerCase()}</span>}
                    {accounts.length > 1 && account && <> · {account.name}</>}
                    {contact._count.notes > 0 && <> · {contact._count.notes} nota(s)</>}
                  </>
                }
                meta={
                  <>
                    <span className="font-mono">
                      {contact.chat?.lastMessageAt
                        ? new Date(contact.chat.lastMessageAt).toLocaleDateString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
                        : "—"}
                    </span>
                    {contact.chat && (
                      <Link
                        href={`/whatsapp/chat/${contact.accountId}/${contact.chat.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-accent-ink hover:underline"
                      >
                        Ver chat
                      </Link>
                    )}
                  </>
                }
              />
            );
          }}
        />
        )}
        {summary && total > 0 && (
          <p className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border px-1 pt-3 text-xs text-muted-darker">
            <span><span className="font-semibold tabular-nums text-foreground">{total.toLocaleString("es-MX")}</span> contactos</span>
            <span><span className="tabular-nums">{pct(summary.withoutTags, total)}%</span> sin etiquetas</span>
            <span><span className="tabular-nums">{pct(summary.withoutConversation, total)}%</span> sin conversación</span>
            {summary.withDeal > 0 && (
              <span>
                {summary.withDeal.toLocaleString("es-MX")} con valor de trato · <span className="font-semibold tabular-nums text-foreground">{formatMxn(summary.dealValueCents, { compact: true })}</span>
              </span>
            )}
          </p>
        )}
        {total > PAGE_SIZE && (
          <div className="flex justify-center pt-2">
            <Pagination
              currentPage={page}
              totalPages={Math.ceil(total / PAGE_SIZE)}
              onPageChange={setPage}
            />
          </div>
        )}
      </div>

      {selectedId && (
        <ContactDrawer
          contactId={selectedId}
          onClose={() => setSelectedId(null)}
          onUpdated={fetchContacts}
        />
      )}

      <ContactImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        accounts={accounts}
        onImported={fetchContacts}
      />
    </div>
  );
}

function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}
