"use client";

import { useId } from "react";
import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Textarea } from "@/app/components/ui/textarea";
import { Select } from "@/app/components/ui/select";
import { Switch } from "@/app/components/ui/switch";
import { FormField } from "@/app/components/ui/form-field";
import { Banner } from "@/app/components/ui/banner";
import { shortId } from "@/lib/automations/graph";
import { STEP_META, LEAD_STATUS_LABEL } from "@/lib/automations/labels";
import { LIMITS, type AutomationChannel, type ValidationIssue } from "@/lib/automations/validate";
import { getTemplateVariables } from "@/lib/whatsapp/template-variables";
import type { ConditionRule, Option, Step, StepOf } from "@/lib/automations/types";
import { templateLanguageLabel } from "@/lib/whatsapp/template-labels";

export interface EditorOptions {
  tags: { id: string; name: string }[];
  fields: { key: string; label: string; type: string; options: string[] }[];
  templates: { id: string; name: string; language: string; components: unknown }[];
  scorers: { id: string; name: string }[];
  users: { id: string; name: string }[];
  teams: { id: string; name: string }[];
  scoreLabels: string[];
}

interface Props {
  step: Step;
  channel: AutomationChannel;
  options: EditorOptions;
  issues: ValidationIssue[];
  onChange: (step: Step) => void;
  onDelete: () => void;
}

const DURATIONS = [
  { value: 5, label: "5 minutos" },
  { value: 15, label: "15 minutos" },
  { value: 30, label: "30 minutos" },
  { value: 60, label: "1 hora" },
  { value: 120, label: "2 horas" },
  { value: 360, label: "6 horas" },
  { value: 720, label: "12 horas" },
  { value: 1440, label: "1 día" },
  { value: 2880, label: "2 días" },
  { value: 4320, label: "3 días" },
  { value: 10080, label: "7 días" },
  { value: 20160, label: "14 días" },
  { value: 43200, label: "30 días" },
];

function DurationSelect({ value, onChange, max }: { value: number; onChange: (v: number) => void; max: number }) {
  const list = DURATIONS.filter((d) => d.value <= max);
  const known = list.some((d) => d.value === value);
  return (
    <Select value={String(value)} onChange={(e) => onChange(Number(e.target.value))}>
      {!known && <option value={value}>{value} minutos</option>}
      {list.map((d) => (
        <option key={d.value} value={d.value}>
          {d.label}
        </option>
      ))}
    </Select>
  );
}

function VariablesHint() {
  return (
    <p className="text-xs text-muted-darker">
      Variables: <code className="font-mono">{"{{nombre}}"}</code>, <code className="font-mono">{"{{telefono}}"}</code>,{" "}
      <code className="font-mono">{"{{var.nombre_variable}}"}</code>, <code className="font-mono">{"{{campo.key}}"}</code>
    </p>
  );
}

function TagInput({ id, value, onChange, tags }: { id?: string; value: string; onChange: (v: string) => void; tags: { name: string }[] }) {
  const listId = `${useId()}-tags`;
  return (
    <>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} list={listId} placeholder="Escribe o elige una etiqueta" maxLength={60} />
      <datalist id={listId}>
        {tags.map((t) => (
          <option key={t.name} value={t.name} />
        ))}
      </datalist>
    </>
  );
}

export function StepEditor({ step, channel, options, issues, onChange, onDelete }: Props) {
  // Helper tipado: actualiza config preservando el tipo del paso.
  const set = <T extends Step>(s: T, patch: Partial<T["config"]>) => onChange({ ...s, config: { ...s.config, ...patch } } as Step);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-title">{STEP_META[step.type].label}</h2>
          <p className="text-xs text-muted">{STEP_META[step.type].description}</p>
        </div>
        <Button variant="danger" size="sm" icon={Trash2} onClick={onDelete} aria-label="Eliminar paso" />
      </div>

      {issues.map((i, n) => (
        <Banner key={n} tone={i.level === "error" ? "danger" : "warning"}>
          {i.message}
        </Banner>
      ))}

      {step.type === "send_text" && (
        <>
          <FormField label="Mensaje" required>
            {(id) => <Textarea id={id} rows={5} value={step.config.text} onChange={(e) => set(step, { text: e.target.value })} maxLength={LIMITS.text} />}
          </FormField>
          <VariablesHint />
          {channel === "WHATSAPP" && (
            <FormField label="Plantilla de respaldo (opcional)" hint="Se envía en su lugar si pasaron más de 24 h desde el último mensaje del cliente.">
              {(id) => (
                <Select id={id} value={step.config.fallbackTemplateId ?? ""} onChange={(e) => set(step, { fallbackTemplateId: e.target.value || null })}>
                  <option value="">Ninguna (si la ventana está cerrada, la ejecución expira)</option>
                  {options.templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({templateLanguageLabel(t.language)})
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
          )}
        </>
      )}

      {(step.type === "send_buttons" || step.type === "send_list") && <OptionsEditor step={step} channel={channel} onChange={onChange} />}

      {step.type === "send_template" && <TemplateEditor step={step} templates={options.templates} onChange={onChange} />}

      {step.type === "wait" && (
        <FormField label="Esperar">
          {() => <DurationSelect value={step.config.minutes} onChange={(minutes) => set(step, { minutes })} max={43200} />}
        </FormField>
      )}

      {step.type === "wait_for_reply" && (
        <>
          <FormField label="Tipo de respuesta">
            {(id) => (
              <Select id={id} value={step.config.validation} onChange={(e) => set(step, { validation: e.target.value as StepOf<"wait_for_reply">["config"]["validation"] })}>
                <option value="any">Cualquier texto</option>
                <option value="number">Número</option>
                <option value="email">Correo electrónico</option>
                <option value="phone">Teléfono</option>
              </Select>
            )}
          </FormField>
          <FormField label="Guardar en variable" hint="Úsala después como {{var.nombre}}.">
            {(id) => (
              <Input
                id={id}
                value={step.config.saveToVar ?? ""}
                onChange={(e) => set(step, { saveToVar: e.target.value.replace(/[^a-z0-9_]/gi, "_").toLowerCase() || null })}
                placeholder="respuesta_cliente"
              />
            )}
          </FormField>
          <FieldSelect label="Guardar también en campo personalizado" value={step.config.saveToCustomField} fields={options.fields} onChange={(saveToCustomField) => set(step, { saveToCustomField })} />
          {step.config.validation !== "any" && (
            <FormField label="Si la respuesta no es válida, responder" hint="Se pide de nuevo hasta 2 veces; luego sigue por “Sin respuesta”.">
              {(id) => <Input id={id} value={step.config.invalidMessage ?? ""} onChange={(e) => set(step, { invalidMessage: e.target.value || null })} placeholder="No entendí, ¿me lo repites?" />}
            </FormField>
          )}
          <FormField label="Esperar como máximo">
            {() => <DurationSelect value={step.config.timeoutMinutes} onChange={(timeoutMinutes) => set(step, { timeoutMinutes })} max={10080} />}
          </FormField>
        </>
      )}

      {step.type === "condition" && <ConditionEditor step={step} options={options} onChange={onChange} />}

      {(step.type === "add_tag" || step.type === "remove_tag") && (
        <FormField label="Etiqueta" required>
          {(id) => <TagInput id={id} value={step.config.tagName} onChange={(tagName) => set(step, { tagName })} tags={options.tags} />}
        </FormField>
      )}

      {step.type === "set_lead_status" && (
        <FormField label="Nueva etapa">
          {(id) => (
            <Select id={id} value={step.config.status} onChange={(e) => set(step, { status: e.target.value as StepOf<"set_lead_status">["config"]["status"] })}>
              {Object.entries(LEAD_STATUS_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          )}
        </FormField>
      )}

      {step.type === "set_custom_field" && (
        <>
          <FieldSelect label="Campo" value={step.config.key || null} fields={options.fields} onChange={(key) => set(step, { key: key ?? "" })} required />
          <FormField label="Valor">
            {(id) => <Input id={id} value={step.config.value} onChange={(e) => set(step, { value: e.target.value })} placeholder="{{var.respuesta_cliente}}" />}
          </FormField>
          <VariablesHint />
        </>
      )}

      {step.type === "assign" && (
        <>
          <FormField label="Asignar a">
            {(id) => (
              <Select id={id} value={step.config.mode} onChange={(e) => set(step, { mode: e.target.value as "user" | "auto" })}>
                <option value="auto">Autoasignación de la cuenta (menos carga)</option>
                <option value="user">Una persona</option>
              </Select>
            )}
          </FormField>
          {step.config.mode === "user" && <UserSelect value={step.config.userId} users={options.users} onChange={(userId) => set(step, { userId })} />}
          {step.config.mode === "auto" && <p className="text-xs text-muted">Usa la autoasignación de la cuenta; si está apagada, no asigna.</p>}
        </>
      )}

      {step.type === "assign_team" && (
        <>
          <FormField label="Equipo" required>
            {(id) => (
              <Select id={id} value={step.config.teamId} onChange={(e) => set(step, { teamId: e.target.value })}>
                <option value="">Elige un equipo</option>
                {options.teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <p className="text-xs text-muted">
            {options.teams.length === 0
              ? "Aún no hay equipos: un admin los crea en Usuarios → Equipos."
              : "Si nadie tiene el chat, se asigna a quien tenga menos carga en el equipo (con la autoasignación de la cuenta activa)."}
          </p>
        </>
      )}

      {step.type === "notify_team" && (
        <>
          <FormField label="Avisar a">
            {(id) => (
              <Select id={id} value={step.config.target} onChange={(e) => set(step, { target: e.target.value as "assignee" | "user" })}>
                <option value="assignee">A quien tenga asignado el chat (o a la persona titular del canal)</option>
                <option value="user">A una persona</option>
              </Select>
            )}
          </FormField>
          {step.config.target === "user" && <UserSelect value={step.config.userId} users={options.users} onChange={(userId) => set(step, { userId })} />}
          <FormField label="Título" required>
            {(id) => <Input id={id} value={step.config.title} onChange={(e) => set(step, { title: e.target.value })} />}
          </FormField>
          <FormField label="Detalle">
            {(id) => <Textarea id={id} rows={3} value={step.config.body} onChange={(e) => set(step, { body: e.target.value })} />}
          </FormField>
          <VariablesHint />
        </>
      )}

      {step.type === "ai_classify" && <CategoriesEditor step={step} onChange={onChange} />}

      {step.type === "ai_extract" && (
        <>
          <FormField label="¿Qué dato extraer?" required hint="Se busca en el último mensaje del cliente.">
            {(id) => <Input id={id} value={step.config.what} onChange={(e) => set(step, { what: e.target.value })} placeholder="La fecha en que quiere su cita" />}
          </FormField>
          <FormField label="Formato">
            {(id) => (
              <Select id={id} value={step.config.format} onChange={(e) => set(step, { format: e.target.value as StepOf<"ai_extract">["config"]["format"] })}>
                <option value="text">Texto</option>
                <option value="number">Número</option>
                <option value="email">Correo</option>
                <option value="date">Fecha (AAAA-MM-DD)</option>
              </Select>
            )}
          </FormField>
          <FormField label="Guardar en variable">
            {(id) => (
              <Input id={id} value={step.config.saveToVar ?? ""} onChange={(e) => set(step, { saveToVar: e.target.value.replace(/[^a-z0-9_]/gi, "_").toLowerCase() || null })} />
            )}
          </FormField>
          <FieldSelect label="Guardar también en campo personalizado" value={step.config.saveToCustomField} fields={options.fields} onChange={(saveToCustomField) => set(step, { saveToCustomField })} />
          <p className="text-xs text-muted">Usa la IA incluida en tu plan: cada llamada gasta un crédito.</p>
        </>
      )}

      {step.type === "score_lead" && (
        <FormField label="Calificador" required>
          {(id) => (
            <Select id={id} value={step.config.scorerId} onChange={(e) => set(step, { scorerId: e.target.value })}>
              <option value="">Elige un calificador</option>
              {options.scorers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          )}
        </FormField>
      )}

      {step.type === "webhook" && (
        <>
          <FormField label="URL" required hint="https:// y accesible desde internet.">
            {(id) => <Input id={id} value={step.config.url} onChange={(e) => set(step, { url: e.target.value })} inputMode="url" />}
          </FormField>
          <FormField label="Método">
            {(id) => (
              <Select id={id} value={step.config.method} onChange={(e) => set(step, { method: e.target.value as "POST" | "GET" })}>
                <option value="POST">POST</option>
                <option value="GET">GET</option>
              </Select>
            )}
          </FormField>
          {step.config.method === "POST" && (
            <FormField label="Cuerpo (JSON)">
              {(id) => <Textarea id={id} rows={6} className="font-mono" value={step.config.body} onChange={(e) => set(step, { body: e.target.value })} />}
            </FormField>
          )}
          <FormField label="Guardar respuesta en" hint="Cada campo del JSON de respuesta queda como {{var.nombre.campo}}; el status en {{var.nombre.status}}.">
            {(id) => (
              <Input id={id} value={step.config.saveToVar ?? ""} onChange={(e) => set(step, { saveToVar: e.target.value.replace(/[^a-z0-9_]/gi, "_").toLowerCase() || null })} />
            )}
          </FormField>
        </>
      )}

      {step.type === "handoff" && (
        <>
          <FormField label="Mensaje al cliente (opcional)">
            {(id) => <Textarea id={id} rows={3} value={step.config.message ?? ""} onChange={(e) => set(step, { message: e.target.value || null })} />}
          </FormField>
          <FormField label="Asignación">
            {(id) => (
              <Select id={id} value={step.config.assign} onChange={(e) => set(step, { assign: e.target.value as "keep" | "auto" })}>
                <option value="auto">Autoasignar si no tiene a nadie</option>
                <option value="keep">Dejar como está</option>
              </Select>
            )}
          </FormField>
          <p className="text-xs text-muted">Avisa en la campana y el bot IA no responde en ese chat durante 24 h.</p>
        </>
      )}

      {step.type === "ai_reply" && <p className="text-sm text-muted">El bot IA activo de la cuenta responde al último mensaje y sigue la conversación. La automatización termina aquí.</p>}
      {step.type === "end" && <p className="text-sm text-muted">La automatización termina aquí.</p>}
    </div>
  );
}

function UserSelect({ value, users, onChange }: { value: string | null; users: { id: string; name: string }[]; onChange: (v: string | null) => void }) {
  return (
    <FormField label="Persona" required>
      {(id) => (
        <Select id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">Elige una persona</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
      )}
    </FormField>
  );
}

function FieldSelect({
  label,
  value,
  fields,
  onChange,
  required,
}: {
  label: string;
  value: string | null;
  fields: EditorOptions["fields"];
  onChange: (v: string | null) => void;
  required?: boolean;
}) {
  return (
    <FormField label={label} required={required} hint={fields.length === 0 ? "Esta cuenta no tiene campos personalizados (Configuración → Campos personalizados)." : undefined}>
      {(id) => (
        <Select id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">{required ? "Elige un campo" : "No guardar"}</option>
          {fields.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </Select>
      )}
    </FormField>
  );
}

function OptionsEditor({ step, channel, onChange }: { step: StepOf<"send_buttons"> | StepOf<"send_list">; channel: AutomationChannel; onChange: (s: Step) => void }) {
  const isList = step.type === "send_list";
  const max = isList ? LIMITS.listRows : LIMITS.buttons;
  const titleMax = isList ? LIMITS.listRowTitle : LIMITS.buttonTitle;
  const setConfig = (patch: Partial<typeof step.config>) => onChange({ ...step, config: { ...step.config, ...patch } } as Step);
  const setOptions = (options: Option[]) => setConfig({ options });
  const move = (i: number, d: -1 | 1) => {
    const copy = [...step.config.options];
    [copy[i], copy[i + d]] = [copy[i + d], copy[i]];
    setOptions(copy);
  };

  return (
    <>
      <FormField label="Mensaje" required>
        {(id) => <Textarea id={id} rows={4} value={step.config.text} onChange={(e) => setConfig({ text: e.target.value })} maxLength={LIMITS.interactiveBody} />}
      </FormField>
      <VariablesHint />
      {isList && step.type === "send_list" && (
        <FormField label="Texto del botón que abre la lista" required>
          {(id) => <Input id={id} value={step.config.buttonLabel} maxLength={LIMITS.listButtonLabel} onChange={(e) => onChange({ ...step, config: { ...step.config, buttonLabel: e.target.value } })} />}
        </FormField>
      )}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-foreground">
          Opciones ({step.config.options.length}/{max})
        </legend>
        {step.config.options.map((o, i) => (
          <div key={o.id} className="space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="w-5 text-right text-xs tabular-nums text-muted">{i + 1}.</span>
              <Input
                aria-label={`Opción ${i + 1}`}
                className="flex-1"
                value={o.title}
                maxLength={titleMax}
                onChange={(e) => setOptions(step.config.options.map((x) => (x.id === o.id ? { ...x, title: e.target.value } : x)))}
              />
              <Button type="button" variant="ghost" size="sm" icon={ArrowUp} disabled={i === 0} onClick={() => move(i, -1)} aria-label="Subir opción" />
              <Button type="button" variant="ghost" size="sm" icon={ArrowDown} disabled={i === step.config.options.length - 1} onClick={() => move(i, 1)} aria-label="Bajar opción" />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                icon={Trash2}
                disabled={step.config.options.length <= 1}
                onClick={() => setOptions(step.config.options.filter((x) => x.id !== o.id))}
                aria-label="Quitar opción"
              />
            </div>
            {isList && (
              <Input
                aria-label={`Descripción de la opción ${i + 1}`}
                className="ml-6"
                value={o.description ?? ""}
                maxLength={LIMITS.listRowDescription}
                placeholder="Descripción (opcional)"
                onChange={(e) => setOptions(step.config.options.map((x) => (x.id === o.id ? { ...x, description: e.target.value || undefined } : x)))}
              />
            )}
          </div>
        ))}
        {step.config.options.length < max && (
          <Button type="button" variant="secondary" size="sm" icon={Plus} onClick={() => setOptions([...step.config.options, { id: shortId("o"), title: "" }])}>
            Agregar opción
          </Button>
        )}
        <p className="text-xs text-muted-darker">
          Máximo {titleMax} caracteres por opción.{" "}
          {channel === "TELEGRAM" ? "En Telegram se muestran como botones bajo el mensaje." : channel === "WEBCHAT" ? "En el widget se muestran como botones." : channel === "WHATSAPP" ? "" : "En Messenger/Instagram se muestran como respuestas rápidas."}
        </p>
      </fieldset>
      <FormField label="Si responde algo que no es una opción">
        {(id) => (
          <Select id={id} value={step.config.fallback} onChange={(e) => setConfig({ fallback: e.target.value as "reprompt" | "other" | "handoff" })}>
            <option value="reprompt">Repetir las opciones (2 veces) y luego “Otra respuesta”</option>
            <option value="other">Ir directo a la rama “Otra respuesta”</option>
            <option value="handoff">Pasar a un humano</option>
          </Select>
        )}
      </FormField>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">Entender respuestas escritas con IA</p>
          <p className="text-xs text-muted-darker">Si escribe “quiero relajarme” en vez de tocar un botón, la IA elige la opción.</p>
        </div>
        <Switch checked={step.config.aiMatch} onCheckedChange={(aiMatch) => setConfig({ aiMatch })} label="Entender respuestas escritas con IA" />
      </div>
      <FormField label="Esperar respuesta como máximo">
        {() => <DurationSelect value={step.config.timeoutMinutes} onChange={(timeoutMinutes) => setConfig({ timeoutMinutes })} max={10080} />}
      </FormField>
    </>
  );
}

function CategoriesEditor({ step, onChange }: { step: StepOf<"ai_classify">; onChange: (s: Step) => void }) {
  const setCategories = (categories: StepOf<"ai_classify">["config"]["categories"]) =>
    onChange({ ...step, config: { ...step.config, categories } });
  return (
    <>
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-foreground">Categorías (cada una abre una rama)</legend>
        {step.config.categories.map((c, i) => (
          <div key={c.id} className="space-y-1 rounded-lg border border-border p-2">
            <div className="flex items-center gap-1.5">
              <Input
                aria-label={`Categoría ${i + 1}`}
                className="flex-1"
                value={c.label}
                maxLength={40}
                placeholder="Nombre"
                onChange={(e) => setCategories(step.config.categories.map((x) => (x.id === c.id ? { ...x, label: e.target.value } : x)))}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                icon={Trash2}
                disabled={step.config.categories.length <= 2}
                onClick={() => setCategories(step.config.categories.filter((x) => x.id !== c.id))}
                aria-label="Quitar categoría"
              />
            </div>
            <Input
              aria-label={`Descripción de la categoría ${i + 1}`}
              value={c.description}
              maxLength={200}
              placeholder="¿Cuándo aplica? p. ej. “pregunta costos o promociones”"
              onChange={(e) => setCategories(step.config.categories.map((x) => (x.id === c.id ? { ...x, description: e.target.value } : x)))}
            />
          </div>
        ))}
        {step.config.categories.length < LIMITS.categories && (
          <Button type="button" variant="secondary" size="sm" icon={Plus} onClick={() => setCategories([...step.config.categories, { id: shortId("c"), label: "", description: "" }])}>
            Agregar categoría
          </Button>
        )}
      </fieldset>
      <FormField label="Instrucciones adicionales (opcional)">
        {(id) => (
          <Textarea id={id} rows={3} value={step.config.instructions} onChange={(e) => onChange({ ...step, config: { ...step.config, instructions: e.target.value } })} />
        )}
      </FormField>
      <p className="text-xs text-muted">Si no quedan créditos de IA o no encuentra categoría, sigue por “Otro”. Gasta un crédito por mensaje clasificado.</p>
    </>
  );
}

function TemplateEditor({ step, templates, onChange }: { step: StepOf<"send_template">; templates: EditorOptions["templates"]; onChange: (s: Step) => void }) {
  const template = templates.find((t) => t.id === step.config.templateId);
  const vars = template ? getTemplateVariables(template.components) : null;
  const setConfig = (patch: Partial<StepOf<"send_template">["config"]>) => onChange({ ...step, config: { ...step.config, ...patch } });
  return (
    <>
      <FormField label="Plantilla aprobada" required>
        {(id) => (
          <Select
            id={id}
            value={step.config.templateId}
            onChange={(e) => {
              const t = templates.find((x) => x.id === e.target.value);
              const count = t ? getTemplateVariables(t.components).bodyParamCount : 0;
              setConfig({ templateId: e.target.value, bodyParams: Array.from({ length: count }, (_, i) => step.config.bodyParams[i] ?? "") });
            }}
          >
            <option value="">Elige una plantilla</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({templateLanguageLabel(t.language)})
              </option>
            ))}
          </Select>
        )}
      </FormField>
      {templates.length === 0 && <p className="text-xs text-muted">Esta cuenta no tiene plantillas aprobadas.</p>}
      {vars &&
        Array.from({ length: vars.bodyParamCount }, (_, i) => (
          <FormField key={i} label={`Variable {{${i + 1}}}`}>
            {(id) => (
              <Input
                id={id}
                value={step.config.bodyParams[i] ?? ""}
                placeholder={i === 0 ? "{{nombre}}" : ""}
                onChange={(e) => {
                  const params = [...step.config.bodyParams];
                  params[i] = e.target.value;
                  setConfig({ bodyParams: params });
                }}
              />
            )}
          </FormField>
        ))}
      {vars?.header.required && (
        <FormField label={vars.header.format === "TEXT" ? "Variable del encabezado" : "Id de media del encabezado"}>
          {(id) => <Input id={id} value={step.config.headerParam ?? ""} onChange={(e) => setConfig({ headerParam: e.target.value || null })} />}
        </FormField>
      )}
      {vars?.buttonUrl?.required && (
        <FormField label="Sufijo del botón de enlace">
          {(id) => <Input id={id} value={step.config.buttonParam ?? ""} onChange={(e) => setConfig({ buttonParam: e.target.value || null })} />}
        </FormField>
      )}
      <VariablesHint />
    </>
  );
}

const SUBJECTS: { value: ConditionRule["subject"]; label: string }[] = [
  { value: "tag", label: "Etiqueta" },
  { value: "lead_status", label: "Etapa del lead" },
  { value: "custom_field", label: "Campo personalizado" },
  { value: "var", label: "Variable" },
  { value: "score_label", label: "Calificación IA" },
  { value: "channel", label: "Canal" },
  { value: "business_hours", label: "Horario laboral" },
];

function ConditionEditor({ step, options, onChange }: { step: StepOf<"condition">; options: EditorOptions; onChange: (s: Step) => void }) {
  const setRules = (rules: ConditionRule[]) => onChange({ ...step, config: { ...step.config, rules } });
  const setRule = (i: number, patch: Partial<ConditionRule>) => setRules(step.config.rules.map((r, n) => (n === i ? { ...r, ...patch } : r)));

  return (
    <>
      <FormField label="Se cumple si">
        {(id) => (
          <Select id={id} value={step.config.match} onChange={(e) => onChange({ ...step, config: { ...step.config, match: e.target.value as "all" | "any" } })}>
            <option value="all">Se cumplen todas las reglas</option>
            <option value="any">Se cumple al menos una</option>
          </Select>
        )}
      </FormField>
      <div className="space-y-3">
        {step.config.rules.map((rule, i) => (
          <div key={i} className="space-y-2 rounded-lg border border-border p-3">
            <div className="flex items-center gap-2">
              <Select
                aria-label="Qué revisar"
                className="flex-1"
                value={rule.subject}
                onChange={(e) => setRule(i, { subject: e.target.value as ConditionRule["subject"], op: e.target.value === "business_hours" ? "present" : "equals", key: null, value: "" })}
              >
                {SUBJECTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
              <Button type="button" variant="ghost" size="sm" icon={Trash2} disabled={step.config.rules.length <= 1} onClick={() => setRules(step.config.rules.filter((_, n) => n !== i))} aria-label="Quitar regla" />
            </div>
            <RuleFields rule={rule} options={options} onChange={(patch) => setRule(i, patch)} />
          </div>
        ))}
        <Button type="button" variant="secondary" size="sm" icon={Plus} onClick={() => setRules([...step.config.rules, { subject: "tag", op: "equals", key: null, value: "" }])}>
          Agregar regla
        </Button>
      </div>
    </>
  );
}

function RuleFields({ rule, options, onChange }: { rule: ConditionRule; options: EditorOptions; onChange: (patch: Partial<ConditionRule>) => void }) {
  if (rule.subject === "business_hours") {
    return (
      <Select aria-label="Horario" value={rule.op} onChange={(e) => onChange({ op: e.target.value as ConditionRule["op"] })}>
        <option value="present">Dentro del horario laboral</option>
        <option value="absent">Fuera del horario laboral</option>
      </Select>
    );
  }
  const isList = rule.subject === "tag" || rule.subject === "score_label";
  const ops: { value: ConditionRule["op"]; label: string }[] = isList
    ? [
        { value: "equals", label: "tiene" },
        { value: "not_equals", label: "no tiene" },
      ]
    : [
        { value: "equals", label: "es igual a" },
        { value: "not_equals", label: "no es" },
        { value: "contains", label: "contiene" },
        { value: "present", label: "tiene valor" },
        { value: "absent", label: "está vacío" },
      ];
  const needsValue = !["present", "absent"].includes(rule.op);
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {(rule.subject === "var" || rule.subject === "custom_field") &&
        (rule.subject === "custom_field" ? (
          <Select aria-label="Campo" className="sm:col-span-2" value={rule.key ?? ""} onChange={(e) => onChange({ key: e.target.value || null })}>
            <option value="">Elige un campo</option>
            {options.fields.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </Select>
        ) : (
          <Input aria-label="Variable" className="sm:col-span-2" value={rule.key ?? ""} placeholder="nombre_variable" onChange={(e) => onChange({ key: e.target.value || null })} />
        ))}
      <Select aria-label="Operador" value={rule.op} onChange={(e) => onChange({ op: e.target.value as ConditionRule["op"] })}>
        {ops.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
      {needsValue &&
        (rule.subject === "lead_status" ? (
          <Select aria-label="Etapa" value={rule.value ?? ""} onChange={(e) => onChange({ value: e.target.value })}>
            <option value="">Elige</option>
            {Object.entries(LEAD_STATUS_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        ) : rule.subject === "channel" ? (
          <Select aria-label="Canal" value={rule.value ?? ""} onChange={(e) => onChange({ value: e.target.value })}>
            <option value="">Elige</option>
            {["WHATSAPP", "TELEGRAM", "MESSENGER", "INSTAGRAM", "WEBCHAT"].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        ) : rule.subject === "score_label" ? (
          <Select aria-label="Calificación" value={rule.value ?? ""} onChange={(e) => onChange({ value: e.target.value })}>
            <option value="">Elige</option>
            {options.scoreLabels.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </Select>
        ) : rule.subject === "tag" ? (
          <TagInput value={rule.value ?? ""} onChange={(value) => onChange({ value })} tags={options.tags} />
        ) : (
          <Input aria-label="Valor" value={rule.value ?? ""} onChange={(e) => onChange({ value: e.target.value })} />
        ))}
    </div>
  );
}
