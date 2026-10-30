"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, Copy, KeyRound, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { SectionHeader } from "@/app/components/ui/section-header";
import { Card } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
import { Banner } from "@/app/components/ui/banner";
import { Input } from "@/app/components/ui/input";
import { Modal } from "@/app/components/ui/modal";
import { FormField } from "@/app/components/ui/form-field";
import { PageContainer } from "@/app/components/ui/page-container";
import { Spinner } from "@/app/components/ui/spinner";
import { useToast } from "@/app/components/ui/toast";
import { PLATFORM_SCOPES, PLATFORM_SCOPE_LABELS, type PlatformScope } from "@/lib/platform/scopes";

interface Check {
  id: string;
  label: string;
  status: "ok" | "warn" | "fail" | "unknown";
  message: string;
  hint?: string;
}

interface Report {
  status: "ok" | "warn" | "fail" | "unknown";
  checkedAt: string;
  live: boolean;
  checks: Check[];
}

interface TokenRow {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  environment: string;
  allowedCidrs: string[];
  createdByEmail: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

const STATUS_TONE: Record<Check["status"], "success" | "warning" | "danger" | "neutral"> = {
  ok: "success",
  warn: "warning",
  fail: "danger",
  unknown: "neutral",
};

const STATUS_LABEL: Record<Check["status"], string> = {
  ok: "OK",
  warn: "Aviso",
  fail: "Falla",
  unknown: "Sin dato",
};

function date(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
}

export function PlataformaOperacion() {
  const { success, error: toastError } = useToast();
  const [report, setReport] = useState<Report | null>(null);
  const [reportError, setReportError] = useState("");
  const [reportLoading, setReportLoading] = useState(true);

  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [tokensLoading, setTokensLoading] = useState(true);
  const [tokensError, setTokensError] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [name, setName] = useState("");
  const [environment, setEnvironment] = useState<"dev" | "production">("production");
  const [scopes, setScopes] = useState<PlatformScope[]>(["platform:read"]);
  const [cidrs, setCidrs] = useState("");
  const [days, setDays] = useState("90");
  const [revoking, setRevoking] = useState<string | null>(null);
  // Se evalúa una vez al montar: comparar expiraciones no debe ser impuro en
  // cada render.
  const [now] = useState(() => Date.now());

  const loadReport = useCallback(async (live: boolean) => {
    setReportLoading(true);
    setReportError("");
    try {
      const res = await fetch(`/api/plataforma/diagnostico${live ? "?live=1" : ""}`, { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "No se pudo cargar el diagnóstico");
      setReport(body as Report);
    } catch (err) {
      setReportError(err instanceof Error ? err.message : "No se pudo cargar el diagnóstico");
    } finally {
      setReportLoading(false);
    }
  }, []);

  const loadTokens = useCallback(async () => {
    setTokensLoading(true);
    setTokensError("");
    try {
      const res = await fetch("/api/plataforma/tokens", { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "No se pudieron cargar los tokens");
      setTokens(body.tokens ?? []);
    } catch (err) {
      setTokensError(err instanceof Error ? err.message : "No se pudieron cargar los tokens");
    } finally {
      setTokensLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial desde el API
    void loadReport(false);
    void loadTokens();
  }, [loadReport, loadTokens]);

  function toggleScope(scope: PlatformScope) {
    setScopes((current) => (current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope]));
  }

  function resetForm() {
    setCreateOpen(false);
    setCreatedToken(null);
    setCreateError("");
    setName("");
    setEnvironment("production");
    setScopes(["platform:read"]);
    setCidrs("");
    setDays("90");
  }

  async function createToken() {
    setCreating(true);
    setCreateError("");
    try {
      const res = await fetch("/api/plataforma/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          environment,
          scopes,
          allowedCidrs: cidrs.split(/[\s,]+/).map((value) => value.trim()).filter(Boolean),
          expiresInDays: Number.parseInt(days, 10) || 90,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "No se pudo crear el token");
      setCreatedToken(body.token);
      success("Token creado. Cópialo ahora: no se vuelve a mostrar.");
      void loadTokens();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "No se pudo crear el token");
    } finally {
      setCreating(false);
    }
  }

  async function revokeToken(id: string) {
    setRevoking(id);
    try {
      const res = await fetch(`/api/plataforma/tokens/${id}`, { method: "DELETE" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "No se pudo revocar");
      success("Token revocado");
      void loadTokens();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "No se pudo revocar");
    } finally {
      setRevoking(null);
    }
  }

  async function copyToken() {
    if (!createdToken) return;
    try {
      await navigator.clipboard.writeText(createdToken);
      success("Copiado");
    } catch {
      toastError("El navegador no permitió copiar; selecciona el texto a mano");
    }
  }

  return (
    <PageContainer width="4xl">
      <section className="space-y-4">
        <SectionHeader eyebrow="Producción" title="Diagnóstico" action={
          <Button variant="secondary" size="sm" icon={RefreshCw} loading={reportLoading} onClick={() => void loadReport(true)}>
            Revisar contra Stripe
          </Button>
        } />
        {reportError && <Banner tone="danger">{reportError}</Banner>}
        {report ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone={STATUS_TONE[report.status]}>{STATUS_LABEL[report.status]}</Badge>
              <span className="text-sm text-muted">
                {report.live ? "Verificado contra Stripe" : "Solo configuración local"} · {date(report.checkedAt)}
              </span>
            </div>
            <div className="grid gap-2 lg:grid-cols-2">
              {report.checks.map((check) => (
                <Card key={check.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{check.label}</p>
                      <p className="text-sm text-muted-darker">{check.message}</p>
                      {check.hint && <p className="mt-1 text-xs text-muted">{check.hint}</p>}
                    </div>
                    <Badge tone={STATUS_TONE[check.status]} size="sm">{STATUS_LABEL[check.status]}</Badge>
                  </div>
                </Card>
              ))}
            </div>
          </>
        ) : reportLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted"><Spinner /> Revisando…</div>
        ) : null}
      </section>

      <section className="space-y-4">
        <SectionHeader eyebrow="Acceso" title="Tokens de operación" action={
          <Button size="sm" icon={Plus} onClick={() => setCreateOpen(true)}>Crear token</Button>
        } />
        <p className="text-sm text-muted-darker">
          Los tokens permiten operar la plataforma desde el MCP o <code>curl</code>. Nacen solo con lectura; la escritura se concede permiso por permiso.
        </p>
        {tokensError && <Banner tone="danger">{tokensError}</Banner>}
        {tokensLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted"><Spinner /> Cargando tokens…</div>
        ) : tokens.length === 0 ? (
          <Banner tone="info">Todavía no hay tokens. Crea uno para conectar el MCP.</Banner>
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border">
            {tokens.map((token) => {
              const expired = token.expiresAt ? new Date(token.expiresAt).getTime() <= now : false;
              const active = !token.revokedAt && !expired;
              return (
                <div key={token.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <KeyRound size={14} className="text-muted" />
                      <p className="font-medium">{token.name}</p>
                      <Badge tone={active ? "success" : token.revokedAt ? "danger" : "warning"} size="sm">
                        {token.revokedAt ? "Revocado" : expired ? "Expirado" : "Activo"}
                      </Badge>
                      <Badge tone="neutral" size="sm">{token.environment}</Badge>
                    </div>
                    <p className="text-sm text-muted-darker">
                      <code>{token.prefix}…</code> · {token.scopes.join(", ")}
                      {token.allowedCidrs.length > 0 ? ` · IPs: ${token.allowedCidrs.join(", ")}` : ""}
                    </p>
                    <p className="text-xs text-muted">
                      Último uso: {date(token.lastUsedAt)} · Expira: {date(token.expiresAt)}
                    </p>
                  </div>
                  {!token.revokedAt && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={Trash2}
                      loading={revoking === token.id}
                      onClick={() => void revokeToken(token.id)}
                    >
                      Revocar
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <Modal
        open={createOpen}
        onClose={resetForm}
        title={createdToken ? "Token creado" : "Crear token de operación"}
        description={createdToken ? "Cópialo ahora. No se vuelve a mostrar." : "Elige solo los permisos que necesites."}
        size="lg"
        footer={
          createdToken ? (
            <Button onClick={resetForm}>Cerrar</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={resetForm} disabled={creating}>Cancelar</Button>
              <Button loading={creating} onClick={() => void createToken()} disabled={!name.trim() || scopes.length === 0}>Crear</Button>
            </>
          )
        }
      >
        {createdToken ? (
          <div className="space-y-3">
            <Banner tone="warning">Guárdalo en tu gestor de secretos. Este valor no se puede recuperar.</Banner>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-light p-3">
              <code className="min-w-0 flex-1 break-all text-xs">{createdToken}</code>
              <Button size="sm" variant="secondary" icon={Copy} onClick={() => void copyToken()}>Copiar</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {createError && <Banner tone="danger">{createError}</Banner>}
            <FormField label="Nombre">{(id) => (
              <Input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="MCP de producción" />
            )}</FormField>
            <FormField label="Entorno">{(id) => (
              <select id={id} value={environment} onChange={(e) => setEnvironment(e.target.value as "dev" | "production")} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm">
                <option value="production">Producción</option>
                <option value="dev">Desarrollo</option>
              </select>
            )}</FormField>
            <div className="space-y-2">
              <p className="text-sm font-medium">Permisos</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {PLATFORM_SCOPES.map((scope) => (
                  <label key={scope} className="flex items-start gap-2 rounded-lg border border-border p-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5 accent-accent"
                      checked={scopes.includes(scope)}
                      onChange={() => toggleScope(scope)}
                    />
                    <span>
                      <span className="block font-medium">{scope}</span>
                      <span className="text-xs text-muted">{PLATFORM_SCOPE_LABELS[scope]}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <FormField label="Allowlist de IP (opcional)" hint="IPv4/IPv6 o CIDR, separadas por coma. Obligatoria para secret:write.">{(id) => (
              <Input id={id} value={cidrs} onChange={(e) => setCidrs(e.target.value)} placeholder="203.0.113.4, 2001:db8::/32" />
            )}</FormField>
            <FormField label="Expira en días">{(id) => (
              <Input id={id} type="number" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} />
            )}</FormField>
            <p className="flex items-center gap-2 text-xs text-muted"><ShieldCheck size={14} /> Los permisos de escritura quedan auditados con tu correo.</p>
            <p className="flex items-center gap-2 text-xs text-muted"><Activity size={14} /> El MCP vive en <code>/api/mcp</code> con OAuth o Bearer.</p>
          </div>
        )}
      </Modal>
    </PageContainer>
  );
}
