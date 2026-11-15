"use client";

import { MessageSquare, LayoutList, ListChecks, FileText, Clock, MessageCircleQuestion, GitBranch, Tag, TagsIcon, KanbanSquare, FormInput, UserPlus, Users, BellRing, ScanText, Target, Bot, Webhook, Hand, CircleStop, Zap } from "lucide-react";
import type { StepType } from "@/lib/automations/types";
import { AiMark } from "@/app/components/ui/ai-mark";

export type AutomationChannelName = "WHATSAPP" | "TELEGRAM" | "MESSENGER" | "INSTAGRAM" | "WEBCHAT";

export const CHANNEL_LABEL: Record<AutomationChannelName, string> = {
  WHATSAPP: "WhatsApp",
  TELEGRAM: "Telegram",
  MESSENGER: "Messenger",
  INSTAGRAM: "Instagram",
  WEBCHAT: "Web",
};

export interface AutomationAccount {
  id: string;
  name: string;
  channel: AutomationChannelName;
}

export const STEP_ICON: Record<StepType, React.ElementType> = {
  send_text: MessageSquare,
  send_buttons: LayoutList,
  send_list: ListChecks,
  send_template: FileText,
  wait: Clock,
  wait_for_reply: MessageCircleQuestion,
  condition: GitBranch,
  add_tag: Tag,
  remove_tag: TagsIcon,
  set_lead_status: KanbanSquare,
  set_custom_field: FormInput,
  assign: UserPlus,
  assign_team: Users,
  notify_team: BellRing,
  ai_classify: AiMark,
  ai_extract: ScanText,
  score_lead: Target,
  ai_reply: Bot,
  webhook: Webhook,
  handoff: Hand,
  end: CircleStop,
};

export const TriggerIcon = Zap;

// Tono del icono por grupo — la IA en azul (info), las esperas en naranja, el resto en el
// acento; da lectura rápida del árbol sin llenarlo de colores.
export function stepTone(type: StepType): "accent" | "info" | "warning" | "neutral" | "success" {
  if (type.startsWith("ai_") || type === "score_lead") return "info";
  if (type === "wait" || type === "wait_for_reply") return "warning";
  if (type === "condition") return "neutral";
  if (type === "handoff" || type === "end" || type === "webhook") return "neutral";
  if (["add_tag", "remove_tag", "set_lead_status", "set_custom_field", "assign", "assign_team", "notify_team"].includes(type)) return "success";
  return "accent";
}

export const RUN_STATUS: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" | "info" | "accent" }> = {
  ACTIVE: { label: "En curso", tone: "accent" },
  WAITING_DELAY: { label: "Esperando tiempo", tone: "info" },
  WAITING_REPLY: { label: "Esperando respuesta", tone: "info" },
  PAUSED_BY_AGENT: { label: "Pausada por agente", tone: "warning" },
  HANDED_OFF: { label: "Pasó a humano", tone: "neutral" },
  HANDED_TO_BOT: { label: "Pasó al bot", tone: "neutral" },
  COMPLETED: { label: "Completada", tone: "success" },
  EXITED_REPLY: { label: "Salió al responder", tone: "neutral" },
  EXPIRED: { label: "Expirada (24 h)", tone: "danger" },
  FAILED: { label: "Falló", tone: "danger" },
  CANCELLED: { label: "Cancelada", tone: "neutral" },
};

export function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
}
