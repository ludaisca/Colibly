"use client";

import { useCallback, useEffect, useState } from "react";
import { DatabaseBackup, PlugZap, Play } from "lucide-react";
import { SectionHeader } from "@/app/components/ui/section-header";
import { FormField } from "@/app/components/ui/form-field";
import { Input } from "@/app/components/ui/input";
import { Select } from "@/app/components/ui/select";
import { Switch } from "@/app/components/ui/switch";
import { Button } from "@/app/components/ui/button";
import { Banner } from "@/app/components/ui/banner";
import { Badge } from "@/app/components/ui/badge";
import { Spinner } from "@/app/components/ui/spinner";
import { Card } from "@/app/components/ui/card";
import { Table, type TableColumn } from "@/app/components/ui/table";
import { ListErrorState } from "@/app/components/ui/list-error-state";
import { useToast } from "@/app/components/ui/toast";
import { SecretField } from "./_configuracion";

interface BackupRun {
  id: string;
  trigger: "SCHEDULED" | "MANUAL";
  status: "RUNNING" | "SUCCESS" | "FAILED";
  startedAt: string;
  finishedAt: string | null;
  dbBytes: number | null;
  mediaBytes: number | null;
  error: string | null;
  triggeredBy: string | null;
}

interface BackupResponse {
  config: {
    enabled: boolean;
    endpoint: string | null;
    region: string | null;
    bucket: string | null;
    prefix: string | null;
    hasAccessKeyId: boolean;
    hasSecretAccessKey: boolean;
    hour: number;
    includeMedia: boolean;
  };
  objectKeys: { db: string; media: string; manifest: string };
  timeZone: string;
  running: boolean;
  nextRunAt: string | null;
  lastSuccessAt: string | null;
  runs: BackupRun[];
}

const STATUS_BADGE = {
  RUNNING: { tone: "info", label: "En curso" },
  SUCCESS: { tone: "success", label: "Correcto" },
  FAILED: { tone: "danger", label: "Falló" },
} as const;

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[i]}`;
}

function formatDate(iso: string | null, timeZone: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-MX", { timeZone, dateStyle: "medium", timeStyle: "short" });
}

function formatDuration(run: BackupRun): string {
  if (!run.finishedAt) return "—";
  const seconds = Math.max(0, Math.round((new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000));
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);

export function PlataformaRespaldos() {
  const { success, error: toastError } = useToast();
  const [data, setData] = useState<BackupResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [form, setForm] = useState({ enabled: false, endpoint: "", region: "", bucket: "", prefix: "", hour: "3", includeMedia: false });
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [cleared, setCleared] = useState({ accessKeyId: false, secretAccessKey: false });

  const load = useCallback(async (opts?: { keepForm?: boolean }) => {
    try {
      const res = await fetch("/api/plataforma/respaldos");
      if (!res.ok) throw new Error();
      const json: BackupResponse = await res.json();
      setData(json);
      setLoadError(null);
      if (!opts?.keepForm) {
        setForm({
          enabled: json.config.enabled,
          endpoint: json.config.endpoint ?? "",
          region: json.config.region ?? "",
          bucket: json.config.bucket ?? "",
          prefix: json.config.prefix ?? "",
          hour: String(json.config.hour),
          includeMedia: json.config.includeMedia,
        });
        setAccessKeyId("");
        setSecretAccessKey("");
        setCleared({ accessKeyId: false, secretAccessKey: false });
        setDirty(false);
      }
    } catch {
      setLoadError("No se pudo cargar la información de respaldos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
    load();
  }, [load]);

  // Mientras hay un respaldo en curso (o recién pedido) se refresca el historial.
  const busy = !!data?.running || starting;
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => load({ keepForm: true }), 4000);
    return () => clearInterval(timer);
  }, [busy, load]);
  useEffect(() => {
    // Si el respaldo pedido ya aparece en curso o terminó, deja de esperar la cola.
    if (starting && data && (data.running || data.runs.some((r) => Date.now() - new Date(r.startedAt).getTime() < 60_000))) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza con la respuesta del servidor
      setStarting(false);
    }
  }, [starting, data]);

  function change<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        backupEnabled: form.enabled,
        backupEndpoint: form.endpoint.trim() || null,
        backupRegion: form.region.trim() || null,
        backupBucket: form.bucket.trim() || null,
        backupPrefix: form.prefix.trim() || null,
        backupHour: Number.parseInt(form.hour, 10),
        backupIncludeMedia: form.includeMedia,
      };
      if (cleared.accessKeyId) payload.backupAccessKeyId = null;
      else if (accessKeyId.trim()) payload.backupAccessKeyId = accessKeyId.trim();
      if (cleared.secretAccessKey) payload.backupSecretAccessKey = null;
      else if (secretAccessKey.trim()) payload.backupSecretAccessKey = secretAccessKey.trim();

      const res = await fetch("/api/plataforma/respaldos", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Error al guardar");
      success("Configuración de respaldos guardada");
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  async function post(action: "test" | "run") {
    const res = await fetch("/api/plataforma/respaldos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? "No se pudo completar la acción");
    return json;
  }

  async function testConnection() {
    setTesting(true);
    try {
      await post("test");
      success("Conexión correcta: el bucket acepta lectura, escritura y borrado");
    } catch (e) {
      toastError(e instanceof Error ? e.message : "No se pudo probar la conexión");
    } finally {
      setTesting(false);
    }
  }

  async function runNow() {
    setStarting(true);
    try {
      await post("run");
      success("Respaldo en cola");
      await load({ keepForm: true });
    } catch (e) {
      setStarting(false);
      toastError(e instanceof Error ? e.message : "No se pudo iniciar el respaldo");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-12 text-sm text-muted-darker">
        <Spinner /> Cargando respaldos…
      </div>
    );
  }
  if (loadError || !data) return <ListErrorState message={loadError ?? "No se pudo cargar."} onRetry={() => load()} />;

  const tz = data.timeZone;
  const latest = data.runs[0];
  const configured = data.config.hasAccessKeyId && data.config.hasSecretAccessKey && !!data.config.bucket;

  const columns: TableColumn<BackupRun>[] = [
    { key: "when", header: "Inicio", cellClassName: "tabular-nums", render: (r) => formatDate(r.startedAt, tz) },
    {
      key: "status",
      header: "Estado",
      render: (r) => (
        <Badge tone={STATUS_BADGE[r.status].tone} size="sm">
          {STATUS_BADGE[r.status].label}
        </Badge>
      ),
    },
    { key: "trigger", header: "Origen", hideBelow: "sm", render: (r) => (r.trigger === "MANUAL" ? `Manual${r.triggeredBy ? ` · ${r.triggeredBy}` : ""}` : "Programado") },
    { key: "size", header: "Base de datos", hideBelow: "md", cellClassName: "tabular-nums", render: (r) => formatBytes(r.dbBytes) },
    { key: "media", header: "Medios", hideBelow: "md", cellClassName: "tabular-nums", render: (r) => formatBytes(r.mediaBytes) },
    { key: "duration", header: "Duración", hideBelow: "sm", cellClassName: "tabular-nums", render: formatDuration },
    { key: "error", header: "Detalle", hideBelow: "md", cellClassName: "max-w-xs truncate", render: (r) => r.error ?? "" },
  ];

  return (
    <div className="max-w-4xl space-y-10">
      {latest?.status === "FAILED" && (
        <Banner tone="danger" title="El último respaldo falló">
          {latest.error ?? "Sin detalle."}
        </Banner>
      )}

      <Card as="section" className="space-y-5">
        <SectionHeader
          eyebrow="Respaldo diario"
          title="Estado"
          action={
            <Button variant="secondary" icon={Play} onClick={runNow} loading={busy} disabled={busy || dirty || !configured}>
              {busy ? "Respaldando…" : "Respaldar ahora"}
            </Button>
          }
        />
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-eyebrow uppercase text-muted">Programación</dt>
            <dd className="mt-1">
              {data.config.enabled ? <Badge tone="success">Activo · {String(data.config.hour).padStart(2, "0")}:00 (Ciudad de México)</Badge> : <Badge tone="neutral">Desactivado</Badge>}
            </dd>
          </div>
          <div>
            <dt className="text-eyebrow uppercase text-muted">Último respaldo correcto</dt>
            <dd className="mt-1 text-sm tabular-nums">{data.lastSuccessAt ? formatDate(data.lastSuccessAt, tz) : "Aún no hay"}</dd>
          </div>
          <div>
            <dt className="text-eyebrow uppercase text-muted">Próximo respaldo</dt>
            <dd className="mt-1 text-sm tabular-nums">{data.nextRunAt ? formatDate(data.nextRunAt, tz) : "—"}</dd>
          </div>
        </dl>
        {dirty && <p className="text-sm text-muted">Guarda los cambios para poder probar la conexión o respaldar.</p>}
      </Card>

      <Card as="section" className="space-y-4">
        <SectionHeader eyebrow="Destino" title="Almacenamiento S3 / Cloudflare R2" />
        <Banner tone="info">
          Cada respaldo <strong>sobrescribe al anterior</strong> en {data.objectKeys.db}. Compatible con AWS S3, Cloudflare R2, Backblaze B2, MinIO y similares. La clave
          necesita permiso de lectura y escritura sobre el bucket.
        </Banner>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Endpoint" hint="R2: https://<id-de-cuenta>.r2.cloudflarestorage.com. Vacío para AWS S3.">
            {(id) => <Input id={id} value={form.endpoint} onChange={(e) => change("endpoint", e.target.value)} placeholder="https://…" />}
          </FormField>
          <FormField label="Región" hint="R2: auto. AWS: p. ej. us-east-1.">
            {(id) => <Input id={id} value={form.region} onChange={(e) => change("region", e.target.value)} placeholder="auto" />}
          </FormField>
          <FormField label="Bucket">
            {(id) => <Input id={id} value={form.bucket} onChange={(e) => change("bucket", e.target.value)} placeholder="colibly-respaldos" />}
          </FormField>
          <FormField label="Carpeta (opcional)" hint="Por defecto: colibly.">
            {(id) => <Input id={id} value={form.prefix} onChange={(e) => change("prefix", e.target.value)} placeholder="colibly" />}
          </FormField>
          <SecretField
            label="Access Key ID"
            hasValue={data.config.hasAccessKeyId}
            value={accessKeyId}
            onChange={(v) => {
              setAccessKeyId(v);
              setDirty(true);
            }}
            cleared={cleared.accessKeyId}
            onToggleClear={() => {
              setCleared((c) => ({ ...c, accessKeyId: !c.accessKeyId }));
              setAccessKeyId("");
              setDirty(true);
            }}
          />
          <SecretField
            label="Secret Access Key"
            hasValue={data.config.hasSecretAccessKey}
            value={secretAccessKey}
            onChange={(v) => {
              setSecretAccessKey(v);
              setDirty(true);
            }}
            cleared={cleared.secretAccessKey}
            onToggleClear={() => {
              setCleared((c) => ({ ...c, secretAccessKey: !c.secretAccessKey }));
              setSecretAccessKey("");
              setDirty(true);
            }}
          />
        </div>
      </Card>

      <Card as="section" className="space-y-4">
        <SectionHeader eyebrow="Programación" title="Cuándo y qué respaldar" />
        <label className="flex items-center gap-3 text-sm">
          <Switch checked={form.enabled} onCheckedChange={(v) => change("enabled", v)} label="Respaldo diario activado" />
          Respaldo diario activado
        </label>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Hora del respaldo" hint="Hora de Ciudad de México. Al activarlo, el primer respaldo sale de inmediato.">
            {(id) => (
              <Select id={id} value={form.hour} onChange={(e) => change("hour", e.target.value)}>
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}:00
                  </option>
                ))}
              </Select>
            )}
          </FormField>
        </div>
        <label className="flex items-start gap-3 text-sm">
          <Switch checked={form.includeMedia} onCheckedChange={(v) => change("includeMedia", v)} label="Incluir archivos multimedia" />
          <span>
            Incluir archivos multimedia (imágenes, audios y documentos de los chats)
            <span className="block text-muted">Pesa mucho más que la base de datos. Se sube como {data.objectKeys.media}.</span>
          </span>
        </label>
        <Banner tone="warning" title="Guarda tu ENCRYPTION_KEY por separado">
          Los tokens y credenciales dentro de la base están cifrados con la variable ENCRYPTION_KEY del servidor. El respaldo no la incluye: sin ella, restaurar la base no
          recupera esos secretos. Guárdala (y AUTH_SECRET) en tu gestor de contraseñas.
        </Banner>
        <div className="flex flex-wrap gap-2">
          <Button onClick={save} loading={saving} icon={DatabaseBackup}>
            Guardar
          </Button>
          <Button variant="secondary" onClick={testConnection} loading={testing} disabled={dirty || !configured} icon={PlugZap}>
            Probar conexión
          </Button>
        </div>
      </Card>

      <Card as="section" className="space-y-4">
        <SectionHeader eyebrow="Historial" title="Últimos respaldos" />
        <Table
          columns={columns}
          rows={data.runs}
          rowKey={(r) => r.id}
          emptyIcon={DatabaseBackup}
          emptyTitle="Aún no hay respaldos"
          emptyDescription="Activa el respaldo diario o usa “Respaldar ahora”."
        />
      </Card>
    </div>
  );
}
