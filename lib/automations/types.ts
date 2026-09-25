// Grafo de una automatización. Es un ÁRBOL: `steps` es una lista que se
// ejecuta en orden; un paso con ramas (botones, condición, clasificación IA,
// esperar respuesta) debe ser el ÚLTIMO de su lista y cada rama es una cola
// completa — las ramas no se vuelven a unir. Así la posición de una ejecución
// es solo un nodeId y "el siguiente" es el hermano que sigue en su lista, que
// es también como lo dibuja el constructor vertical.
//
// Todo es JSON plano: se guarda en Automation.draftGraph y, al publicar, en
// AutomationVersion.graph (inmutable).

export const GRAPH_VERSION = 1;

// ─── Disparadores ───────────────────────────────────────────────────────────

export type Trigger =
  | { type: "keyword"; keywords: string[]; match: "exact" | "contains" }
  | { type: "first_message" }
  | { type: "message_received" }
  | { type: "tag_added"; tagName: string }
  | { type: "lead_status_changed"; status: LeadStatusValue }
  | { type: "appointment_completed" }
  | { type: "score_label"; label: string }
  | { type: "ad_lead"; origin: "ANY" | "CTWA" | "INSTANT_FORM" }
  | { type: "manual" };

export type TriggerType = Trigger["type"];

// Disparadores que dependen de un mensaje entrante: se evalúan de forma
// síncrona en la ingesta (antes de encolar el bot). El resto llega por el bus
// de eventos de dominio.
export const INBOUND_TRIGGERS: readonly TriggerType[] = ["keyword", "first_message", "message_received"];

export type LeadStatusValue = "NEW" | "CONTACTED" | "QUALIFIED" | "CUSTOMER" | "LOST";

// ─── Pasos ──────────────────────────────────────────────────────────────────

export interface Option {
  id: string; // único en todo el grafo — viaja como id de botón / callback_data
  title: string; // ≤ 20 caracteres (límite de botones de WhatsApp)
  description?: string; // solo listas
}

export interface Branch {
  id: string;
  // Qué rama es: la opción/categoría que la abre, o una rama especial.
  key: string; // option.id | category.id | "yes" | "no" | "answered" | "timeout" | "other"
  label: string;
  steps: Step[];
}

export type ReplyFallback = "reprompt" | "other" | "handoff";

export interface StepBase {
  id: string;
}

export type Step = StepBase &
  (
    | { type: "send_text"; config: { text: string; fallbackTemplateId?: string | null } }
    | {
        type: "send_buttons";
        config: {
          text: string;
          options: Option[]; // 1-3
          timeoutMinutes: number;
          fallback: ReplyFallback;
          aiMatch: boolean; // si ni el id ni el texto coinciden, la IA elige la opción
        };
        branches: Branch[]; // una por opción + "other" + "timeout"
      }
    | {
        type: "send_list";
        config: {
          text: string;
          buttonLabel: string;
          options: Option[]; // 1-10
          timeoutMinutes: number;
          fallback: ReplyFallback;
          aiMatch: boolean;
        };
        branches: Branch[];
      }
    | {
        type: "send_template";
        config: { templateId: string; bodyParams: string[]; headerParam?: string | null; buttonParam?: string | null };
      }
    | { type: "wait"; config: { minutes: number } }
    | {
        type: "wait_for_reply";
        config: {
          timeoutMinutes: number;
          validation: "any" | "number" | "email" | "phone";
          saveToVar: string | null;
          saveToCustomField: string | null;
          invalidMessage: string | null; // se manda y se vuelve a esperar (máx. 2 veces)
        };
        branches: Branch[]; // "answered" + "timeout"
      }
    | {
        type: "condition";
        config: { match: "all" | "any"; rules: ConditionRule[] };
        branches: Branch[]; // "yes" + "no"
      }
    | { type: "add_tag"; config: { tagName: string } }
    | { type: "remove_tag"; config: { tagName: string } }
    | { type: "set_lead_status"; config: { status: LeadStatusValue } }
    | { type: "set_custom_field"; config: { key: string; value: string } }
    | { type: "assign"; config: { mode: "user" | "auto"; userId: string | null } }
    | { type: "notify_team"; config: { target: "assignee" | "user"; userId: string | null; title: string; body: string } }
    | {
        type: "ai_classify";
        config: { instructions: string; categories: { id: string; label: string; description: string }[] };
        branches: Branch[]; // una por categoría + "other"
      }
    | {
        type: "ai_extract";
        config: { what: string; format: "text" | "number" | "email" | "date"; saveToVar: string | null; saveToCustomField: string | null };
      }
    | { type: "ai_reply"; config: Record<string, never> }
    | { type: "score_lead"; config: { scorerId: string } }
    | {
        type: "webhook";
        config: { url: string; method: "POST" | "GET"; body: string; saveToVar: string | null };
      }
    | { type: "handoff"; config: { message: string | null; assign: "keep" | "auto" } }
    | { type: "end"; config: Record<string, never> }
  );

export type StepType = Step["type"];
export type StepOf<T extends StepType> = Extract<Step, { type: T }>;
export type BranchingStep = Extract<Step, { branches: Branch[] }>;

export interface ConditionRule {
  subject: "var" | "tag" | "lead_status" | "custom_field" | "score_label" | "channel" | "business_hours";
  op: "equals" | "not_equals" | "contains" | "present" | "absent";
  key: string | null; // nombre de variable / key del campo personalizado
  value: string | null;
}

export interface Graph {
  version: typeof GRAPH_VERSION;
  trigger: Trigger;
  steps: Step[];
}

export function isBranching(step: Step): step is BranchingStep {
  return "branches" in step && Array.isArray((step as BranchingStep).branches);
}

// Pasos que conversan con el contacto: una automatización que los contiene
// "toma" la conversación — el bot IA calla mientras corre y solo puede haber
// una así por chat a la vez.
export const CONVERSATIONAL_STEPS: readonly StepType[] = [
  "send_text",
  "send_buttons",
  "send_list",
  "send_template",
  "wait_for_reply",
  "ai_reply",
  "handoff",
];

// ─── Estado de una ejecución ────────────────────────────────────────────────

export interface WaitingReply {
  nodeId: string;
  kind: "options" | "free";
  reprompts: number;
}

export interface RunState {
  nodeId: string | null; // próximo paso a ejecutar (null = terminó)
  vars: Record<string, string>;
  waiting: WaitingReply | null;
}

export type RunInput =
  | { kind: "start" }
  | { kind: "resume" } // venció una espera de tiempo
  | { kind: "reply"; text: string; replyId: string | null }
  | { kind: "timeout" }; // venció la espera de respuesta
