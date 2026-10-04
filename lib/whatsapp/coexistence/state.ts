import type { WACoexistenceSyncStatus } from "@prisma/client";
import type { HistoryEnvelope } from "./normalize";
import { historyIsComplete } from "./normalize";

// Reglas PURAS de la sincronización de coexistencia (sin base de datos).

export type SyncAction = "contacts" | "history" | "expire" | "none";

// Qué toca hacer ahora con una cuenta recién conectada. Meta da 24 h desde el
// alta para pedir contactos e historial; cada petición solo puede hacerse una vez.
export function nextSyncAction(status: WACoexistenceSyncStatus, deadline: Date | null, now: Date): SyncAction {
  if (status !== "PENDING" && status !== "CONTACTS_REQUESTED") return "none";
  if (deadline && now > deadline) return "expire";
  return status === "PENDING" ? "contacts" : "history";
}

export interface SyncUpdate {
  status: WACoexistenceSyncStatus;
  progress: number | null;
  error: string | null;
}

const FINAL: WACoexistenceSyncStatus[] = ["COMPLETED", "HISTORY_DECLINED", "EXPIRED", "FAILED"];

// Cómo cambia el estado al llegar un webhook `history`. Un estado final nunca
// retrocede (los webhooks no llegan en orden garantizado).
export function syncAfterHistory(current: { status: WACoexistenceSyncStatus; progress: number | null }, env: HistoryEnvelope): SyncUpdate {
  if (FINAL.includes(current.status)) return { status: current.status, progress: current.progress, error: null };
  if (env.kind === "declined") return { status: "HISTORY_DECLINED", progress: current.progress, error: null };
  if (env.kind === "error") return { status: current.status, progress: current.progress, error: env.message };
  if (historyIsComplete(env.progress)) return { status: "COMPLETED", progress: 100, error: null };
  const progress = env.progress === null ? current.progress : Math.max(current.progress ?? 0, env.progress);
  return { status: current.status, progress, error: null };
}

export const TOKEN_WARNING_DAYS = 10;
export const TOKEN_ALERT_REPEAT_DAYS = 3;

export type TokenAlert = "none" | "soon" | "expired";

// Avisos del token de negocio: "soon" dentro de TOKEN_WARNING_DAYS (repetido
// cada TOKEN_ALERT_REPEAT_DAYS) y "expired" una sola vez al vencer.
export function tokenAlertFor(now: Date, expiresAt: Date | null, alertedAt: Date | null): TokenAlert {
  if (!expiresAt) return "none";
  const day = 86_400_000;
  if (expiresAt <= now) return alertedAt && alertedAt >= expiresAt ? "none" : "expired";
  if (expiresAt.getTime() - now.getTime() > TOKEN_WARNING_DAYS * day) return "none";
  if (alertedAt && now.getTime() - alertedAt.getTime() < TOKEN_ALERT_REPEAT_DAYS * day) return "none";
  return "soon";
}

export type LifecycleAction =
  | { kind: "disconnect"; reason: string; detail: string }
  | { kind: "offboarded" }
  | { kind: "reconnected" }
  | { kind: "none" };

const DISCONNECT_REASONS: Record<string, string> = {
  ACCOUNT_DISCONNECTED: "El negocio desconectó Colibly desde la app WhatsApp Business.",
  BUSINESS_DOWNGRADE: "La cuenta dejó de ser una cuenta de WhatsApp Business.",
  CHANGE_NUMBER: "El negocio cambió de número de teléfono.",
  COMPANION_INACTIVITY: "Un dispositivo vinculado estuvo inactivo demasiado tiempo.",
  PRIMARY_INACTIVITY: "El teléfono con la app WhatsApp Business estuvo inactivo demasiado tiempo: WhatsApp exige abrirla con frecuencia.",
  USER_RE_REGISTERED: "El negocio volvió a registrar su número en otro teléfono.",
};

// Interpreta un `account_update` de Meta relacionado con el ciclo de vida de la
// conexión (desconexión, cambio de teléfono, reconexión).
export function lifecycleActionFor(value: { event?: string; disconnection_info?: { reason?: string; initiated_by?: string } } | null | undefined): LifecycleAction {
  const event = value?.event;
  if (event === "PARTNER_REMOVED") {
    const reason = value?.disconnection_info?.reason ?? "UNKNOWN";
    const by = value?.disconnection_info?.initiated_by === "SYSTEM" ? " (iniciada por WhatsApp)" : "";
    return { kind: "disconnect", reason, detail: (DISCONNECT_REASONS[reason] ?? `Meta reportó la desconexión (${reason}).`) + by };
  }
  if (event === "ACCOUNT_OFFBOARDED") return { kind: "offboarded" };
  if (event === "ACCOUNT_RECONNECTED") return { kind: "reconnected" };
  return { kind: "none" };
}
