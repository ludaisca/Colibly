"use client";

import { Input } from "@/app/components/ui/input";
import { Select } from "@/app/components/ui/select";
import { Switch } from "@/app/components/ui/switch";
import { FormField } from "@/app/components/ui/form-field";
import { Banner } from "@/app/components/ui/banner";
import { TRIGGER_META, LEAD_STATUS_LABEL } from "@/lib/automations/labels";
import type { AutomationSettings } from "@/lib/automations/settings";
import type { Trigger, TriggerType } from "@/lib/automations/types";
import type { AutomationChannel, ValidationIssue } from "@/lib/automations/validate";
import type { EditorOptions } from "./_step-editor";

function defaultTrigger(type: TriggerType): Trigger {
  switch (type) {
    case "keyword":
      return { type, keywords: ["hola"], match: "contains" };
    case "tag_added":
      return { type, tagName: "" };
    case "lead_status_changed":
      return { type, status: "QUALIFIED" };
    case "score_label":
      return { type, label: "prioridad_alta" };
    case "ad_lead":
      return { type, origin: "ANY" };
    default:
      return { type } as Trigger;
  }
}

export function TriggerEditor({
  trigger,
  settings,
  channel,
  options,
  issues,
  onChange,
  onSettingsChange,
}: {
  trigger: Trigger;
  settings: AutomationSettings;
  channel: AutomationChannel;
  options: EditorOptions;
  issues: ValidationIssue[];
  onChange: (t: Trigger) => void;
  onSettingsChange: (s: AutomationSettings) => void;
}) {
  const available = (Object.keys(TRIGGER_META) as TriggerType[]).filter((t) => t !== "ad_lead" || channel === "WHATSAPP");
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-title">¿Cuándo empieza?</h2>
      </div>
      {issues.map((i, n) => (
        <Banner key={n} tone={i.level === "error" ? "danger" : "warning"}>
          {i.message}
        </Banner>
      ))}
      <FormField label="Cuando">
        {(id) => (
          <Select id={id} value={trigger.type} onChange={(e) => onChange(defaultTrigger(e.target.value as TriggerType))}>
            {available.map((t) => (
              <option key={t} value={t}>
                {TRIGGER_META[t].label}
              </option>
            ))}
          </Select>
        )}
      </FormField>
      <p className="-mt-3 text-xs text-muted">{TRIGGER_META[trigger.type].description}</p>

      {trigger.type === "keyword" && (
        <>
          <FormField label="Palabras o frases" hint="Separadas por coma. No distingue mayúsculas ni acentos.">
            {(id) => (
              <Input
                id={id}
                value={trigger.keywords.join(", ")}
                onChange={(e) => onChange({ ...trigger, keywords: e.target.value.split(",").map((k) => k.trimStart()) })}
                placeholder="hola, menú, precios"
              />
            )}
          </FormField>
          <FormField label="Coincidencia">
            {(id) => (
              <Select id={id} value={trigger.match} onChange={(e) => onChange({ ...trigger, match: e.target.value as "exact" | "contains" })}>
                <option value="contains">El mensaje contiene la palabra</option>
                <option value="exact">El mensaje es exactamente la palabra</option>
              </Select>
            )}
          </FormField>
        </>
      )}
      {trigger.type === "tag_added" && (
        <FormField label="Etiqueta" required>
          {(id) => (
            <Select id={id} value={trigger.tagName} onChange={(e) => onChange({ ...trigger, tagName: e.target.value })}>
              <option value="">Elige una etiqueta</option>
              {options.tags.map((t) => (
                <option key={t.id} value={t.name}>
                  {t.name}
                </option>
              ))}
            </Select>
          )}
        </FormField>
      )}
      {trigger.type === "lead_status_changed" && (
        <FormField label="Cuando el lead pasa a">
          {(id) => (
            <Select id={id} value={trigger.status} onChange={(e) => onChange({ ...trigger, status: e.target.value as typeof trigger.status })}>
              {Object.entries(LEAD_STATUS_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          )}
        </FormField>
      )}
      {trigger.type === "score_label" && (
        <FormField label="Calificación">
          {(id) => (
            <Select id={id} value={trigger.label} onChange={(e) => onChange({ ...trigger, label: e.target.value })}>
              {options.scoreLabels.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </Select>
          )}
        </FormField>
      )}
      {trigger.type === "ad_lead" && (
        <FormField label="Origen">
          {(id) => (
            <Select id={id} value={trigger.origin} onChange={(e) => onChange({ ...trigger, origin: e.target.value as typeof trigger.origin })}>
              <option value="ANY">Cualquier anuncio</option>
              <option value="CTWA">Anuncio con botón a WhatsApp</option>
              <option value="INSTANT_FORM">Formulario instantáneo</option>
            </Select>
          )}
        </FormField>
      )}
      {trigger.type === "manual" && (
        <p className="text-sm text-muted">Se inicia desde el chat (“Iniciar automatización”) o por la API pública.</p>
      )}

      <div className="space-y-4 border-t border-border pt-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">Puede repetirse para el mismo contacto</p>
            <p className="text-xs text-muted-darker">Si está apagado, cada contacto pasa una sola vez.</p>
          </div>
          <Switch checked={settings.allowReentry} onCheckedChange={(allowReentry) => onSettingsChange({ ...settings, allowReentry })} label="Puede repetirse" />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">Salir si el contacto escribe durante una espera</p>
            <p className="text-xs text-muted-darker">Útil en seguimientos: no seguir el guion con alguien que ya está conversando.</p>
          </div>
          <Switch checked={settings.exitOnReply} onCheckedChange={(exitOnReply) => onSettingsChange({ ...settings, exitOnReply })} label="Salir si escribe" />
        </div>
      </div>
    </div>
  );
}
