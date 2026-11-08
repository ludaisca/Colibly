"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/app/components/ui/badge";
import { Banner } from "@/app/components/ui/banner";
import { DetailRow } from "@/app/components/ui/detail-page";
import { SectionHeader } from "@/app/components/ui/section-header";
import { plural } from "@/lib/format/plural";

export interface ConexionInfo {
  id: string;
  usesPlatformApp: boolean;
  coexistence: boolean;
  syncStatus: string;
  syncProgress: number | null;
  syncDeadlineAt: string | null;
  syncError: string | null;
  historySkippedChats?: number;
  historySkippedMessages?: number;
  tokenExpiresAt: string | null;
  disconnectedReason: string | null;
}

const IN_PROGRESS = ["PENDING", "CONTACTS_REQUESTED", "HISTORY_REQUESTED"];
const POLL_MS = 15_000;
const TOKEN_WARNING_DAYS = 10;

function syncLabel(info: ConexionInfo): { label: string; tone: "success" | "warning" | "danger" | "neutral" } {
  switch (info.syncStatus) {
    case "PENDING": return { label: "Preparando", tone: "warning" };
    case "CONTACTS_REQUESTED": return { label: "Importando contactos", tone: "warning" };
    case "HISTORY_REQUESTED": return { label: `Importando historial ${info.syncProgress ?? 0} %`, tone: "warning" };
    case "COMPLETED": return { label: "Completa", tone: "success" };
    case "HISTORY_DECLINED": return { label: "Sin historial (no se compartió)", tone: "neutral" };
    case "EXPIRED": return { label: "Venció", tone: "danger" };
    case "FAILED": return { label: "Falló", tone: "danger" };
    default: return { label: "—", tone: "neutral" };
  }
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
}

// Cómo se conectó la cuenta y, si es coexistencia, cómo va la sincronización con
// la app WhatsApp Business del cliente. Se actualiza sola mientras sincroniza.
export function ConexionCard({ initial }: { initial: ConexionInfo }) {
  // Lo que llega del sondeo se superpone a lo recibido de la página; no se
  // copia `initial` a un estado (se actualiza solo cuando la página recarga).
  const [live, setLive] = useState<Partial<ConexionInfo>>({});
  const [now] = useState(() => Date.now());
  const info: ConexionInfo = { ...initial, ...live };

  useEffect(() => {
    if (!info.coexistence || !IN_PROGRESS.includes(info.syncStatus)) return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/whatsapp/accounts/${info.id}`);
        if (!res.ok) return;
        const data = await res.json();
        setLive({
          syncStatus: data.syncStatus,
          syncProgress: data.syncProgress,
          syncDeadlineAt: data.syncDeadlineAt,
          syncError: data.syncError,
          historySkippedChats: data.historySkippedChats,
          historySkippedMessages: data.historySkippedMessages,
        });
      } catch {
        /* se reintenta en el siguiente ciclo */
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [info.id, info.coexistence, info.syncStatus]);

  if (!info.usesPlatformApp) return null;

  const sync = syncLabel(info);
  const syncing = IN_PROGRESS.includes(info.syncStatus);
  const daysToToken = info.tokenExpiresAt ? Math.ceil((new Date(info.tokenExpiresAt).getTime() - now) / 86_400_000) : null;

  return (
    <section className="space-y-4">
      <SectionHeader title="Conexión con WhatsApp" />
      {syncing && (
        <Banner tone="info" title="Sincronizando con la app WhatsApp Business">
          Mantén abierta la app WhatsApp Business en el teléfono del negocio hasta que termine. Los mensajes nuevos ya se reciben.
          {info.syncDeadlineAt && info.syncStatus !== "HISTORY_REQUESTED" ? ` Límite para iniciar: ${formatDateTime(info.syncDeadlineAt)}.` : ""}
        </Banner>
      )}
      {info.syncStatus === "EXPIRED" && (
        <Banner tone="danger" title="La sincronización venció">
          Pasaron las 24 horas que da WhatsApp para importar los contactos y el historial. Para repetirla hay que desconectar el número y
          volver a conectarlo.
        </Banner>
      )}
      {!!info.historySkippedChats && (
        <Banner tone="warning" title="Llegaste al límite de contactos de tu plan">
          {`${info.historySkippedChats.toLocaleString("es-MX")} ${info.historySkippedChats === 1 ? "conversación" : "conversaciones"} del historial (${(info.historySkippedMessages ?? 0).toLocaleString("es-MX")} mensajes) se importaron sin crear contacto. Siguen en la bandeja; el contacto se crea cuando esa persona vuelva a escribir. `}
          <a href="/configuracion/plan" className="font-medium underline underline-offset-2">Ver plan</a>
        </Banner>
      )}
      {info.syncError && info.syncStatus !== "COMPLETED" && <Banner tone="warning">{info.syncError}</Banner>}
      {daysToToken !== null && daysToToken <= TOKEN_WARNING_DAYS && (
        <Banner tone={daysToToken <= 0 ? "danger" : "warning"} title={daysToToken <= 0 ? "El acceso a WhatsApp venció" : "El acceso a WhatsApp vence pronto"}>
          {daysToToken <= 0 ? "Vuelve a conectar el número para restablecerlo." : `Vence en ${plural(daysToToken, "día")}. Vuelve a conectar el número antes de esa fecha.`}
        </Banner>
      )}
      <dl className="space-y-4">
        <DetailRow label="Tipo de conexión" value={info.coexistence ? "Con la app WhatsApp Business (coexistencia)" : "Número en Cloud API"} />
        {info.coexistence && <DetailRow label="Sincronización" value={<Badge tone={sync.tone} size="sm">{sync.label}</Badge>} />}
        {info.coexistence && syncing && info.syncProgress !== null && (
          <div className="h-2 w-full overflow-hidden rounded-full bg-accent-subtle" role="progressbar" aria-valuenow={info.syncProgress} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-accent transition-[width]" style={{ width: `${Math.min(100, Math.max(0, info.syncProgress))}%` }} />
          </div>
        )}
        {info.tokenExpiresAt && <DetailRow label="Acceso vigente hasta" value={formatDateTime(info.tokenExpiresAt)} />}
        {info.disconnectedReason && <DetailRow label="Motivo de la desconexión" value={info.disconnectedReason} />}
      </dl>
    </section>
  );
}
