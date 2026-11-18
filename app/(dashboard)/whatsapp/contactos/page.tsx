"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { SampleDataControls } from "@/app/components/ui/sample-data-controls";
import { GettingStarted } from "@/app/components/ui/getting-started";
import { formatMxn } from "@/lib/money";
import { Search, RefreshCw, Upload, UserPlus } from "lucide-react";
import { Input } from "@/app/components/ui/input";
import { FiltersPanel, type FilterFieldDef } from "@/app/components/ui/filters-panel";
import { Button } from "@/app/components/ui/button";
import { PageHeader } from "@/app/components/ui/page-header";
import { Pagination } from "@/app/components/ui/pagination";
import { useToast } from "@/app/components/ui/toast";
import { ContactDrawer } from "@/app/components/whatsapp/contact-drawer";
import { ContactCreateModal } from "@/app/components/whatsapp/contact-create-modal";
import { ContactsTable, type ContactTableRow } from "./_table";
import { useSession } from "next-auth/react";
import { loadContactAccounts } from "@/app/components/whatsapp/contact-accounts";
import { ContactImportModal } from "@/app/components/whatsapp/contact-import-modal";
import { DismissibleNudge } from "@/app/components/ui/dismissible-nudge";
import { shouldNudgeUntagged } from "@/lib/pipeline/nudge";
import { ContactLimitBanner, ContactUsageMeter, useContactUsage } from "@/app/components/billing/contact-usage";
import { LEAD_STATUS_LABEL } from "@/app/components/ui/lead-status";
import { plural } from "@/lib/format/plural";

const PAGE_SIZE = 25;

interface AccountOption {
  id: string;
  name: string;
  phoneNumber: string | null;
  channel?: string;
}

type ContactRow = ContactTableRow & { _count: { notes: number } };

export default function ContactosPage() {
  const { error: toastError } = useToast();
  const { data: session } = useSession();
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
  const [createOpen, setCreateOpen] = useState(false);
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
      setAccounts(await loadContactAccounts());
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
        description={total > 0 ? plural(total, "contacto") : undefined}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <ContactUsageMeter usage={contactUsage} />
            <Button size="md" icon={UserPlus} onClick={() => setCreateOpen(true)}>
              Nuevo contacto
            </Button>
            <SampleDataControls />
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

      {/* Solo sin filtros: el resumen describe entonces a todos los contactos. */}
      {summary && !search && !leadStatusFilter && !accountFilter && shouldNudgeUntagged({ total, withoutTags: summary.withoutTags }) && (
        <DismissibleNudge
          id="contactos-sin-etiquetas"
          title="La mayoría de tus contactos no tiene etiquetas"
          action={<Button href="/whatsapp/automatizaciones?plantilla=ai_triage" size="sm" variant="secondary">Etiquetar con IA</Button>}
        >
          Etiquétalos para segmentar campañas y automatizaciones. Puedes agregarlas desde la ficha de cada contacto o el chat, o dejar que la automatización «Clasificar con IA» las ponga sola.
        </DismissibleNudge>
      )}

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
                  ...Object.entries(LEAD_STATUS_LABEL).map(([value, label]) => ({ value, label })),
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
              description="Agrégalos a mano, impórtalos de un CSV o se crearán solos cuando alguien te escriba por un canal conectado."
              memberHint="Los contactos aparecen cuando alguien escribe a una de tus cuentas. Si no ves ninguna, pide a un administrador que te comparta una cuenta."
              extraAction={
                <span className="flex flex-wrap justify-center gap-2">
                  <Button size="sm" icon={UserPlus} onClick={() => setCreateOpen(true)}>Nuevo contacto</Button>
                  <Button variant="secondary" size="sm" icon={Upload} onClick={() => setImportOpen(true)}>Importar CSV</Button>
                  <SampleDataControls size="sm" />
                </span>
              }
            />
          </div>
        ) : (
        <ContactsTable
          rows={contacts}
          loading={loading}
          error={fetchError}
          onRetry={fetchContacts}
          onOpen={setSelectedId}
          onChanged={fetchContacts}
          canDelete={session?.user?.role === "admin"}
          empty={{
            title: search || leadStatusFilter || accountFilter ? "Sin resultados" : "Sin contactos",
            description: search || leadStatusFilter || accountFilter
              ? "No hay contactos con esa búsqueda o filtros."
              : "Se crean solos cuando alguien escribe a tus canales.",
            action: search || leadStatusFilter || accountFilter ? (
              <Button variant="secondary" size="sm" onClick={() => {
                setSearchInput("");
                setSearch("");
                setLeadStatusFilter("");
                setAccountFilter("");
              }}>Limpiar búsqueda y filtros</Button>
            ) : undefined,
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
      <ContactCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        accounts={accounts}
        onCreated={(id) => { fetchContacts(); setSelectedId(id); }}
      />
    </div>
  );
}

function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}
