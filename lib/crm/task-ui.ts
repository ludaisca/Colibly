// Tipos y formato de tareas para la interfaz (módulo sin dependencias de
// servidor: lo importan componentes de cliente).

export type TaskKind = "TODO" | "CALL" | "MESSAGE" | "EMAIL" | "MEETING";

export interface TaskItem {
  id: string;
  title: string;
  notes: string | null;
  kind: TaskKind;
  status: "OPEN" | "DONE";
  dueAt: string | null;
  remindMinutesBefore: number | null;
  completedAt: string | null;
  source: string;
  overdue: boolean;
  assigneeId: string | null;
  assignee: { id: string; name: string | null } | null;
  personId: string | null;
  person: { id: string; name: string } | null;
  companyId: string | null;
  company: { id: string; name: string } | null;
  dealId: string | null;
  deal: { id: string; title: string; status: "OPEN" | "WON" | "LOST" } | null;
}

export const TASK_KINDS: Array<{ value: TaskKind; label: string }> = [
  { value: "TODO", label: "Tarea" },
  { value: "CALL", label: "Llamada" },
  { value: "MESSAGE", label: "Mensaje" },
  { value: "EMAIL", label: "Correo" },
  { value: "MEETING", label: "Reunión" },
];

export const REMIND_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "none", label: "Sin aviso" },
  { value: "0", label: "A la hora" },
  { value: "15", label: "15 minutos antes" },
  { value: "60", label: "1 hora antes" },
  { value: "1440", label: "1 día antes" },
];

export const taskKindLabel = (kind: TaskKind) => TASK_KINDS.find((k) => k.value === kind)?.label ?? "Tarea";

export function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// "Hoy 15:30", "Mañana 09:00", "12 oct 18:00".
export function formatDue(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false });
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(d) - startOfDay(now)) / 86_400_000);
  if (diffDays === 0) return `Hoy ${time}`;
  if (diffDays === 1) return `Mañana ${time}`;
  if (diffDays === -1) return `Ayer ${time}`;
  return `${d.toLocaleDateString("es-MX", { day: "numeric", month: "short" })} ${time}`;
}
