"use client";

import { NeedsChannelEmpty } from "@/app/components/ui/needs-channel";
import { useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, RefreshCw, MessageSquareText } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Select } from "@/app/components/ui/select";
import { Badge } from "@/app/components/ui/badge";
import { Spinner } from "@/app/components/ui/spinner";
import { EmptyState } from "@/app/components/ui/empty-state";
import { ListErrorState } from "@/app/components/ui/list-error-state";
import { PageHeader } from "@/app/components/ui/page-header";
import { EntityList, EntityRow } from "@/app/components/ui/entity-list";
import { EntityAvatar } from "@/app/components/ui/avatar";
import { useToast } from "@/app/components/ui/toast";
import { templateCategoryLabel, templateLanguageLabel } from "@/lib/whatsapp/template-labels";
import { useRunOnChange } from "@/app/components/ui/use-run-on-change";

interface Account { id: string; name: string; channel: string; wabaId: string | null; status: string; }

interface Template {
  id: string;
  templateId: string;
  name: string;
  language: string;
  category: string;
  status: string;
  statusReason?: string | null;
  components: unknown;
  syncedAt: string;
  createdAt: string;
  waAccountId: string;
}

const STATUS_BADGE: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  PENDING: { label: "En revisión", tone: "warning" },
  IN_APPEAL: { label: "En apelación", tone: "warning" },
  APPROVED: { label: "Aprobada", tone: "success" },
  REJECTED: { label: "Rechazada", tone: "danger" },
  PAUSED: { label: "Pausada", tone: "neutral" },
  DISABLED: { label: "Deshabilitada", tone: "neutral" },
  PENDING_DELETION: { label: "Se eliminará", tone: "neutral" },
  LIMIT_EXCEEDED: { label: "Límite excedido", tone: "danger" },
  DELETED: { label: "Ya no está en Meta", tone: "danger" },
};

function TemplatesContent() {
  const searchParams = useSearchParams();
  const preselectedId = searchParams.get("accountId");
  const { success, error: toastError } = useToast();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const fetchAccounts = useCallback(async () => {
    setAccountsLoading(true);
    setAccountsError(null);
    try {
      const res = await fetch("/api/whatsapp/accounts");
      const data = await res.json();
      if (!res.ok || !Array.isArray(data)) throw new Error(data.error ?? "Error al cargar cuentas");
      const available = data.filter((account: Account) => account.channel === "WHATSAPP");
      setAccounts(available);
      setSelectedAccountId(preselectedId && available.some((account: Account) => account.id === preselectedId)
        ? preselectedId : available.length === 1 ? available[0].id : "");
    } catch (error) {
      setAccounts([]);
      setSelectedAccountId("");
      setAccountsError(error instanceof Error ? error.message : "Error al cargar cuentas");
    } finally {
      setAccountsLoading(false);
    }
  }, [preselectedId]);

  useRunOnChange(() => fetchAccounts(), [fetchAccounts]);

  const fetchTemplates = useCallback(async () => {
    if (!selectedAccountId) {
      setTemplates([]);
      return;
    }
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(`/api/whatsapp/templates?waAccountId=${selectedAccountId}`);
      const data = await res.json();
      if (Array.isArray(data)) setTemplates(data);
      else throw new Error(data.error ?? "Error al cargar plantillas");
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Error al cargar plantillas");
    } finally {
      setLoading(false);
    }
  }, [selectedAccountId]);

  useRunOnChange(() => fetchTemplates(), [fetchTemplates]);

  async function handleSync() {
    if (!selectedAccountId) return;
    setSyncing(true);
    try {
      const res = await fetch("/api/whatsapp/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ waAccountId: selectedAccountId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Error al sincronizar");
      }
      success("Plantillas sincronizadas");
      fetchTemplates();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Error");
    } finally {
      setSyncing(false);
    }
  }

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);
  const missingWabaId = selectedAccount && !selectedAccount.wabaId;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Plantillas"
      />

      {/* Sin cuenta conectada no se muestran controles deshabilitados: solo la
          línea de "Conectar WhatsApp" de abajo. */}
      {accounts.length > 0 && (
      <div className="flex items-end gap-3 flex-wrap">
        <div className="w-64">
          <Select
            aria-label="Cuenta de WhatsApp"
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
            placeholder="Seleccionar cuenta"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} {!a.wabaId ? "(sin WABA ID)" : ""}
              </option>
            ))}
          </Select>
        </div>
        <Button
          variant="secondary"
          size="sm"
          icon={syncing ? undefined : RefreshCw}
          onClick={handleSync}
          disabled={!selectedAccountId || syncing}
        >
          {syncing ? <Spinner /> : "Sincronizar"}
        </Button>
        <Button
          size="sm"
          icon={Plus}
          href={`/whatsapp/plantillas/nueva?accountId=${encodeURIComponent(selectedAccountId)}`}
          disabled={!selectedAccountId || missingWabaId}
        >
          Crear plantilla
        </Button>
      </div>
      )}

      {missingWabaId && selectedAccountId && (
        <p className="text-sm text-muted">
          Esta cuenta no tiene WABA ID configurado. Necesitas configurarlo para crear plantillas.
        </p>
      )}

      {accountsLoading ? (
        <div className="flex items-center justify-center py-16"><Spinner /></div>
      ) : accountsError ? (
        <ListErrorState message={accountsError} onRetry={fetchAccounts} />
      ) : accounts.length === 0 ? (
        <NeedsChannelEmpty icon={MessageSquareText} description="Las plantillas de WhatsApp se crean y aprueban por número. Conecta tu número para gestionarlas." />
      ) : !selectedAccountId ? (
        <EmptyState
          icon={MessageSquareText}
          title="Selecciona una cuenta"
          description={accounts.length === 0 ? "Conecta una cuenta WhatsApp para gestionar sus plantillas." : "Elige una cuenta WhatsApp para ver sus plantillas."}
        />
      ) : (
        <EntityList
          rows={templates}
          rowKey={(t) => t.id}
          loading={loading}
          error={fetchError}
          onRetry={fetchTemplates}
          emptyIcon={MessageSquareText}
          emptyTitle="Sin plantillas"
          emptyDescription="No hay plantillas en esta cuenta. Sincroniza desde Meta o crea una nueva."
          rowHref={(t) => `/whatsapp/plantillas/${t.id}`}
          renderRow={(t) => {
            const badge = STATUS_BADGE[t.status] ?? { label: t.status, tone: "neutral" as const };
            return (
              <EntityRow
                leading={<EntityAvatar id={t.waAccountId} name={t.name} size="sm" />}
                title={t.name}
                badges={<Badge tone={badge.tone} size="sm">{badge.label}</Badge>}
                subtitle={<>{templateLanguageLabel(t.language)} · {templateCategoryLabel(t.category)}{t.statusReason ? <> · <span className={t.status === "APPROVED" || t.status === "PENDING" ? "" : "text-danger"}>{t.statusReason}</span></> : null}</>}
                meta={
                  <>
                    <span className="tabular-nums">
                      {new Date(t.syncedAt).toLocaleDateString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className="text-accent-ink">Ver métricas →</span>
                  </>
                }
              />
            );
          }}
        />
      )}

    </div>
  );
}

export default function TemplatesPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-16">
        <Spinner />
      </div>
    }>
      <TemplatesContent />
    </Suspense>
  );
}
