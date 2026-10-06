import type { TaskItem } from "@/lib/crm/task-ui";

// Forma JSON de `getMyDay()` tal como llega a la interfaz (fechas ISO).
export interface MyDayAppointment {
  id: string;
  title: string;
  scheduledAt: string;
  durationMinutes: number;
  contactName: string;
  contact: { personId: string };
}

export interface MyDay {
  userId: string;
  timezone: string;
  now: string;
  counts: { tasksOverdue: number; tasksToday: number; appointmentsToday: number; chatsWaiting: number; dealsWithoutNextStep: number };
  tasks: { overdue: TaskItem[]; today: TaskItem[]; upcoming: TaskItem[]; undated: TaskItem[] };
  appointments: { today: MyDayAppointment[]; pendingClose: MyDayAppointment[] };
  chats: Array<{ id: string; channel: string; accountId: string; accountName: string | null; name: string | null; lastMessage: string | null; lastMessageAt: string | null; personId: string | null; waitingMinutes: number | null }>;
  dealsWithoutNextStep: Array<{ id: string; title: string; amount: number; stageEnteredAt: string; person: { id: string; name: string }; stage: { id: string; name: string; color: string } }>;
}
