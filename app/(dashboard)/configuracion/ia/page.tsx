"use client";

import { useState, useEffect } from "react";
import { Save } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Select } from "@/app/components/ui/select";
import { FormField } from "@/app/components/ui/form-field";
import { Spinner } from "@/app/components/ui/spinner";
import { SectionHeader } from "@/app/components/ui/section-header";
import { DetailPage } from "@/app/components/ui/detail-page";
import { Switch } from "@/app/components/ui/switch";
import { Progress } from "@/app/components/ui/progress";
import { useToast } from "@/app/components/ui/toast";
import { Banner } from "@/app/components/ui/banner";
import { Card } from "@/app/components/ui/card";
import { Textarea } from "@/app/components/ui/textarea";
import { Checkbox } from "@/app/components/ui/checkbox";
import { timeZoneLabel } from "@/lib/format/time-zone";
import { formatHourOfDay } from "@/app/components/ui/time-select";

interface OrgAiSettings {
  aiCredits: { used: number; limit: number | null };
  aiCreditsPeriodStart: string;
  timezone: string;
  businessHourStart: number;
  businessHourEnd: number;
  leadRecoveryEnabled: boolean;
  leadRecoveryFirstMessageHours: number;
  leadRecoverySecondMessageHours: number | null;
  autoResolveAfterHours: number | null;
  autoResolveMessage: string | null;
  autoResolveTagName: string | null;
  autoResolveSkipWaiting: boolean;
  businessDays: number[];
  awayMessageEnabled: boolean;
  awayMessageText: string | null;
  autoTranscribeAudio: boolean;
  slaEnabled: boolean;
  slaResponseMinutes: number;
  slaResolutionHours: number;
  slaBusinessHoursOnly: boolean;
}

// Lunes primero (convención en México); el valor es el de Date#getDay.
const WEEKDAYS = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mié" },
  { value: 4, label: "Jue" },
  { value: 5, label: "Vie" },
  { value: 6, label: "Sáb" },
  { value: 0, label: "Dom" },
];

// Zonas más comunes de los clientes; la actual se agrega si no está.
const TIMEZONES = [
  "America/Mexico_City",
  "America/Tijuana",
  "America/Cancun",
  "America/Guatemala",
  "America/Costa_Rica",
  "America/Panama",
  "America/Bogota",
  "America/Lima",
  "America/Guayaquil",
  "America/Caracas",
  "America/La_Paz",
  "America/Santiago",
  "America/Argentina/Buenos_Aires",
  "America/Montevideo",
  "America/Asuncion",
  "America/Santo_Domingo",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/Madrid",
];

export default function IASettingsPage() {
  const { success, error: toastError } = useToast();
  const [settings, setSettings] = useState<OrgAiSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [timezone, setTimezone] = useState("America/Mexico_City");
  const [hourStart, setHourStart] = useState(8);
  const [hourEnd, setHourEnd] = useState(20);
  const [savingHours, setSavingHours] = useState(false);
  const [businessDays, setBusinessDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [awayEnabled, setAwayEnabled] = useState(false);
  const [awayText, setAwayText] = useState("");
  const [autoTranscribe, setAutoTranscribe] = useState(false);
  const [savingAway, setSavingAway] = useState(false);
  const [recoveryEnabled, setRecoveryEnabled] = useState(false);
  const [recoveryFirstHours, setRecoveryFirstHours] = useState(2);
  const [recoverySecondHours, setRecoverySecondHours] = useState("12");
  const [savingRecovery, setSavingRecovery] = useState(false);
  const [autoResolveEnabled, setAutoResolveEnabled] = useState(false);
  const [autoResolveHours, setAutoResolveHours] = useState(24);
  const [autoResolveMessage, setAutoResolveMessage] = useState("");
  const [autoResolveTag, setAutoResolveTag] = useState("");
  const [autoResolveSkipWaiting, setAutoResolveSkipWaiting] = useState(true);
  const [slaEnabled, setSlaEnabled] = useState(false);
  const [slaResponseMinutes, setSlaResponseMinutes] = useState(60);
  const [slaResolutionHours, setSlaResolutionHours] = useState(8);
  const [slaBusinessHoursOnly, setSlaBusinessHoursOnly] = useState(true);
  const [savingSla, setSavingSla] = useState(false);
  const [savingAutoResolve, setSavingAutoResolve] = useState(false);

  useEffect(() => {
    fetch("/api/configuracion/ia")
      .then((r) => r.json())
      .then((d: OrgAiSettings & { error?: string }) => {
        if (d.error) throw new Error(d.error);
        setSettings(d);
        setTimezone(d.timezone);
        setHourStart(d.businessHourStart);
        setHourEnd(d.businessHourEnd);
        setRecoveryEnabled(d.leadRecoveryEnabled);
        setRecoveryFirstHours(d.leadRecoveryFirstMessageHours);
        setRecoverySecondHours(d.leadRecoverySecondMessageHours != null ? String(d.leadRecoverySecondMessageHours) : "");
        setAutoResolveEnabled(d.autoResolveAfterHours !== null);
        setAutoResolveHours(d.autoResolveAfterHours ?? 24);
        setAutoResolveMessage(d.autoResolveMessage ?? "");
        setAutoResolveTag(d.autoResolveTagName ?? "");
        setAutoResolveSkipWaiting(d.autoResolveSkipWaiting);
        setSlaEnabled(d.slaEnabled);
        setSlaResponseMinutes(d.slaResponseMinutes);
        setSlaResolutionHours(d.slaResolutionHours);
        setSlaBusinessHoursOnly(d.slaBusinessHoursOnly);
        setBusinessDays(d.businessDays);
        setAwayEnabled(d.awayMessageEnabled);
        setAwayText(d.awayMessageText ?? "");
        setAutoTranscribe(d.autoTranscribeAudio);
      })
      .catch(() => toastError("Error al cargar la configuración"))
      .finally(() => setLoading(false));
  }, [toastError]);

  async function patch(body: Record<string, unknown>, okMessage: string) {
    const res = await fetch("/api/configuracion/ia", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Error al guardar");
    setSettings(data);
    success(okMessage);
  }

  async function handleSaveHours() {
    setSavingHours(true);
    try {
      await patch({ timezone, businessHourStart: hourStart, businessHourEnd: hourEnd, businessDays }, "Horario guardado");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSavingHours(false);
    }
  }

  async function handleSaveRecovery() {
    setSavingRecovery(true);
    try {
      await patch(
        {
          leadRecoveryEnabled: recoveryEnabled,
          leadRecoveryFirstMessageHours: recoveryFirstHours,
          leadRecoverySecondMessageHours: recoverySecondHours.trim() ? Number(recoverySecondHours) : null,
        },
        "Recuperación de leads guardada"
      );
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSavingRecovery(false);
    }
  }

  // Se guarda al cambiar el interruptor (un solo campo, sin formulario).
  async function handleToggleTranscribe(on: boolean) {
    setAutoTranscribe(on);
    try {
      await patch({ autoTranscribeAudio: on }, on ? "Las notas de voz se transcribirán solas" : "Transcripción automática apagada");
    } catch (err) {
      setAutoTranscribe(!on);
      toastError(err instanceof Error ? err.message : "Error al guardar");
    }
  }

  function toggleDay(day: number, on: boolean) {
    setBusinessDays((prev) => (on ? Array.from(new Set([...prev, day])) : prev.filter((d) => d !== day)));
  }

  async function handleSaveAway() {
    setSavingAway(true);
    try {
      await patch({ awayMessageEnabled: awayEnabled, awayMessageText: awayText.trim() || null }, "Mensaje fuera de horario guardado");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSavingAway(false);
    }
  }

  async function handleSaveAutoResolve() {
    setSavingAutoResolve(true);
    try {
      await patch(
        {
          autoResolveAfterHours: autoResolveEnabled ? autoResolveHours : null,
          autoResolveMessage: autoResolveMessage.trim() || null,
          autoResolveTagName: autoResolveTag.trim() || null,
          autoResolveSkipWaiting,
        },
        "Auto-resolver guardado"
      );
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSavingAutoResolve(false);
    }
  }

  async function handleSaveSla() {
    setSavingSla(true);
    try {
      await patch(
        { slaEnabled, slaResponseMinutes, slaResolutionHours, slaBusinessHoursOnly },
        slaEnabled ? "Tiempos de atención guardados" : "Tiempos de atención desactivados"
      );
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSavingSla(false);
    }
  }

  if (loading) return <div className="flex items-center justify-center py-16"><Spinner /></div>;

  const credits = settings?.aiCredits;
  const pct = credits?.limit ? Math.round((credits.used / credits.limit) * 100) : 0;
  const timezones = TIMEZONES.includes(timezone) ? TIMEZONES : [timezone, ...TIMEZONES];

  return (
    <DetailPage
      backHref="/configuracion"
      backLabel="Volver a configuración"
      title="IA y operación"
      description="Créditos de IA, horario del negocio y automatismos de la bandeja. La IA viene incluida en tu plan: no necesitas API keys."
    >
      <Card as="section" className="space-y-4">
        <SectionHeader eyebrow="Incluida en tu plan" title="Créditos de IA" />
        {credits && (
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-medium">Este mes</p>
              <p className="text-sm tabular-nums text-muted">
                <span className="font-semibold text-foreground">{credits.used.toLocaleString("es-MX")}</span>
                {credits.limit !== null ? ` / ${credits.limit.toLocaleString("es-MX")}` : " · sin límite"}
              </p>
            </div>
            {credits.limit !== null && (
              <Progress value={pct} tone={pct >= 100 ? "danger" : pct >= 80 ? "warning" : "accent"} className="mt-3" />
            )}
            <p className="mt-2 text-xs text-muted-darker">
              1 crédito = 1 respuesta de bot, sugerencia, calificación, mensaje de recuperación o paso de IA. Al agotarse,
              los bots dejan de responder hasta el siguiente periodo.{" "}
              <a href="/configuracion/plan" className="tap-target text-accent-ink underline underline-offset-2">Ver mi plan</a>
            </p>
          </div>
        )}
        <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
          <div>
            <p className="text-sm font-medium">Transcribir notas de voz automáticamente</p>
            <p className="text-xs text-muted-darker">
              Cada audio que recibes se convierte en texto bajo la burbuja. Usa 1 crédito por audio. Apagado, cualquiera
              puede pedir la transcripción con el botón &quot;Transcribir&quot; del audio.
            </p>
          </div>
          <Switch checked={autoTranscribe} onCheckedChange={handleToggleTranscribe} label="Transcribir notas de voz" />
        </div>
      </Card>

      <Card as="section" className="space-y-5">
        <SectionHeader title="Horario del negocio" />
        <p className="text-sm text-muted">
          Se usa para no mandar mensajes automáticos de madrugada (recuperación de leads, leads de Facebook), para la
          condición “en horario” de las automatizaciones y para las citas que agenda el bot.
        </p>
        <FormField label="Zona horaria">
          {(id) => (
            <Select id={id} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              {timezones.map((tz) => (
                <option key={tz} value={tz}>{timeZoneLabel(tz)}</option>
              ))}
            </Select>
          )}
        </FormField>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Abre">
            {(id) => (
              <Select id={id} value={String(hourStart)} onChange={(e) => setHourStart(Number(e.target.value))}>
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{formatHourOfDay(h)}</option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField label="Cierra">
            {(id) => (
              <Select id={id} value={String(hourEnd)} onChange={(e) => setHourEnd(Number(e.target.value))}>
                {Array.from({ length: 24 }, (_, h) => h + 1).map((h) => (
                  <option key={h} value={h}>{formatHourOfDay(h)}</option>
                ))}
              </Select>
            )}
          </FormField>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-foreground">Días hábiles</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {WEEKDAYS.map((day) => (
              <Checkbox
                key={day.value}
                label={day.label}
                checked={businessDays.includes(day.value)}
                onChange={(on) => toggleDay(day.value, on)}
              />
            ))}
          </div>
          <p className="text-xs text-muted-darker">Fuera de estos días todo cuenta como fuera de horario.</p>
        </fieldset>
        <Button size="sm" variant="secondary" icon={Save} loading={savingHours} disabled={businessDays.length === 0} onClick={handleSaveHours}>
          Guardar horario
        </Button>
      </Card>

      <Card as="section" className="space-y-5">
        <SectionHeader title="Recuperación de leads" />
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Reactivar leads que dejan de responder</p>
            <p className="text-xs text-muted-darker">
              Cuando un lead se queda &quot;en visto&quot;, el bot de esa cuenta le manda hasta 2 mensajes de seguimiento,
              generados con IA, dentro del horario del negocio. Cada mensaje usa un crédito de IA.
            </p>
          </div>
          <Switch checked={recoveryEnabled} onCheckedChange={setRecoveryEnabled} label="Reactivar leads" />
        </div>

        {recoveryEnabled && (
          <>
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField label="Horas de silencio para el mensaje 1" hint="Desde el último mensaje del lead">
                {(id) => (
                  <Input id={id} type="number" min="1" max="168" value={recoveryFirstHours} onChange={(e) => setRecoveryFirstHours(Number(e.target.value))} />
                )}
              </FormField>
              <FormField label="Horas de silencio para el mensaje 2" hint="Vacío = solo se manda 1 mensaje">
                {(id) => (
                  <Input id={id} type="number" min="1" max="168" value={recoverySecondHours} onChange={(e) => setRecoverySecondHours(e.target.value)} placeholder="Deshabilitado" />
                )}
              </FormField>
            </div>
            {(recoveryFirstHours >= 24 || Number(recoverySecondHours) >= 24) && (
              <Banner tone="warning">
                En WhatsApp solo se puede escribir texto libre dentro de las 24 h posteriores al último mensaje del lead:
                los mensajes configurados a 24 h o más no se enviarán a chats de WhatsApp (sí a Telegram, Messenger e
                Instagram, que no tienen esa restricción).
              </Banner>
            )}
          </>
        )}

        <Button size="sm" variant="secondary" icon={Save} loading={savingRecovery} onClick={handleSaveRecovery}>
          Guardar recuperación de leads
        </Button>
      </Card>

      <Card as="section" className="space-y-5">
        <SectionHeader title="Bandeja" />
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Mensaje fuera de horario</p>
            <p className="text-xs text-muted-darker">
              Contesta solo cuando escriben fuera del horario del negocio, como máximo una vez cada 12 h por chat. No se
              manda si la cuenta tiene un bot activo o una automatización está atendiendo el chat. El chat sigue en
              &quot;Esperando respuesta&quot; para tu equipo.
            </p>
          </div>
          <Switch checked={awayEnabled} onCheckedChange={setAwayEnabled} label="Mensaje fuera de horario" />
        </div>
        {awayEnabled && (
          <FormField label="Mensaje" hint="Máximo 1000 caracteres">
            {(id) => (
              <Textarea id={id} rows={3} maxLength={1000} value={awayText} onChange={(e) => setAwayText(e.target.value)} placeholder="¡Gracias por escribir! Estamos fuera de horario; te contestamos mañana a partir de las 9:00." />
            )}
          </FormField>
        )}
        <Button size="sm" variant="secondary" icon={Save} loading={savingAway} disabled={awayEnabled && !awayText.trim()} onClick={handleSaveAway}>
          Guardar mensaje fuera de horario
        </Button>

        <div className="border-t border-border pt-5" />
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Resolver solos los chats inactivos</p>
            <p className="text-xs text-muted-darker">
              Un chat abierto o pendiente sin mensajes durante el tiempo que elijas se marca como resuelto. Si el
              cliente vuelve a escribir, se reabre solo. No se manda encuesta de satisfacción.
            </p>
          </div>
          <Switch checked={autoResolveEnabled} onCheckedChange={setAutoResolveEnabled} label="Resolver chats inactivos" />
        </div>

        {autoResolveEnabled && (
          <>
            <FormField label="Horas sin mensajes" hint="Entre 1 y 720 (30 días)">
              {(id) => (
                <Input id={id} type="number" min="1" max="720" value={autoResolveHours} onChange={(e) => setAutoResolveHours(Number(e.target.value))} />
              )}
            </FormField>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">No resolver si el cliente espera respuesta</p>
                <p className="text-xs text-muted-darker">
                  Recomendado: un chat cuyo último mensaje es del cliente y nadie contestó se queda abierto.
                </p>
              </div>
              <Switch checked={autoResolveSkipWaiting} onCheckedChange={setAutoResolveSkipWaiting} label="No resolver si espera respuesta" />
            </div>
            <FormField label="Mensaje al resolver (opcional)" hint="En WhatsApp solo sale si la ventana de 24 h sigue abierta">
              {(id) => (
                <Textarea id={id} rows={3} maxLength={1000} value={autoResolveMessage} onChange={(e) => setAutoResolveMessage(e.target.value)} placeholder="Cerramos esta conversación por inactividad. Escríbenos cuando quieras." />
              )}
            </FormField>
            <FormField label="Etiqueta al resolver (opcional)" hint="Solo en chats de WhatsApp">
              {(id) => (
                <Input id={id} maxLength={50} value={autoResolveTag} onChange={(e) => setAutoResolveTag(e.target.value)} placeholder="Cerrado por inactividad" />
              )}
            </FormField>
          </>
        )}

        <Button size="sm" variant="secondary" icon={Save} loading={savingAutoResolve} onClick={handleSaveAutoResolve}>
          Guardar auto-resolver
        </Button>
      </Card>

      <Card as="section" className="space-y-5" id="sla">
        <SectionHeader title="Tiempos de atención (SLA)" />
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Avisar cuando un chat se pasa del tiempo</p>
            <p className="text-xs text-muted-darker">
              Si un cliente espera respuesta más de lo acordado, o una conversación abierta tarda demasiado en
              resolverse, avisamos en la campana (y con notificación del navegador) a quien tiene el chat asignado, o a
              los administradores si nadie lo tiene. En la bandeja verás esos chats con el filtro &quot;Fuera de
              SLA&quot;. Los chats pospuestos o pendientes no cuentan; el tiempo empieza a contar al activarlo.
            </p>
          </div>
          <Switch checked={slaEnabled} onCheckedChange={setSlaEnabled} label="Activar tiempos de atención" />
        </div>
        {slaEnabled && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Responder en (minutos)" hint="Cada vez que el cliente escribe. Entre 5 y 1440">
                {(id) => (
                  <Input id={id} type="number" min="5" max="1440" value={slaResponseMinutes} onChange={(e) => setSlaResponseMinutes(Number(e.target.value))} />
                )}
              </FormField>
              <FormField label="Resolver en (horas)" hint="Desde que la conversación se abre. Entre 1 y 720">
                {(id) => (
                  <Input id={id} type="number" min="1" max="720" value={slaResolutionHours} onChange={(e) => setSlaResolutionHours(Number(e.target.value))} />
                )}
              </FormField>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Contar solo en horario del negocio</p>
                <p className="text-xs text-muted-darker">
                  Recomendado: un mensaje del sábado en la noche no vence hasta que abras el lunes. Usa el horario y los
                  días hábiles de arriba.
                </p>
              </div>
              <Switch checked={slaBusinessHoursOnly} onCheckedChange={setSlaBusinessHoursOnly} label="Contar solo en horario del negocio" />
            </div>
          </>
        )}
        <Button size="sm" variant="secondary" icon={Save} loading={savingSla} onClick={handleSaveSla}>
          Guardar tiempos de atención
        </Button>
      </Card>
    </DetailPage>
  );
}
