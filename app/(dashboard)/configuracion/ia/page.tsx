"use client";

import { useState, useEffect } from "react";
import { Save, Sparkles } from "lucide-react";
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

interface OrgAiSettings {
  aiCredits: { used: number; limit: number | null };
  aiCreditsPeriodStart: string;
  models: Array<{ id: string; label: string; description: string }>;
  timezone: string;
  businessHourStart: number;
  businessHourEnd: number;
  leadRecoveryEnabled: boolean;
  leadRecoveryFirstMessageHours: number;
  leadRecoverySecondMessageHours: number | null;
}

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
  const [recoveryEnabled, setRecoveryEnabled] = useState(false);
  const [recoveryFirstHours, setRecoveryFirstHours] = useState(2);
  const [recoverySecondHours, setRecoverySecondHours] = useState("12");
  const [savingRecovery, setSavingRecovery] = useState(false);

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
      await patch({ timezone, businessHourStart: hourStart, businessHourEnd: hourEnd }, "Horario guardado");
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

  if (loading) return <div className="flex items-center justify-center py-16"><Spinner /></div>;

  const credits = settings?.aiCredits;
  const pct = credits?.limit ? Math.round((credits.used / credits.limit) * 100) : 0;
  const timezones = TIMEZONES.includes(timezone) ? TIMEZONES : [timezone, ...TIMEZONES];

  return (
    <DetailPage
      backHref="/configuracion"
      backLabel="Volver a configuración"
      title="Inteligencia artificial"
      description="La IA viene incluida en tu plan: no necesitas API keys."
    >
      <section className="space-y-4">
        <SectionHeader eyebrow="Incluida en tu plan" title="Créditos de IA" />
        {credits && (
          <div className="rounded-xl border border-border bg-surface p-4">
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
              <a href="/configuracion/plan" className="text-accent-ink hover:underline">Ver mi plan</a>
            </p>
          </div>
        )}
        {settings && settings.models.length === 0 ? (
          <Banner tone="warning">La IA no está disponible en este momento. Escríbenos si el problema continúa.</Banner>
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-medium">Modelos disponibles para tus bots y calificadores</p>
            <ul className="space-y-1.5">
              {settings?.models.map((m) => (
                <li key={m.id} className="flex items-start gap-2 text-sm">
                  <Sparkles size={14} className="mt-0.5 shrink-0 text-accent-ink" />
                  <span>
                    <span className="font-medium">{m.label}</span> <span className="text-muted">— {m.description}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="space-y-5">
        <SectionHeader title="Horario del negocio" />
        <p className="text-sm text-muted">
          Se usa para no mandar mensajes automáticos de madrugada (recuperación de leads, leads de Facebook), para la
          condición “en horario” de las automatizaciones y para las citas que agenda el bot.
        </p>
        <FormField label="Zona horaria">
          {(id) => (
            <Select id={id} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              {timezones.map((tz) => (
                <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>
              ))}
            </Select>
          )}
        </FormField>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Abre">
            {(id) => (
              <Select id={id} value={String(hourStart)} onChange={(e) => setHourStart(Number(e.target.value))}>
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField label="Cierra">
            {(id) => (
              <Select id={id} value={String(hourEnd)} onChange={(e) => setHourEnd(Number(e.target.value))}>
                {Array.from({ length: 24 }, (_, h) => h + 1).map((h) => (
                  <option key={h} value={h}>{String(h % 24).padStart(2, "0")}:00</option>
                ))}
              </Select>
            )}
          </FormField>
        </div>
        <Button size="sm" variant="secondary" icon={Save} loading={savingHours} onClick={handleSaveHours}>
          Guardar horario
        </Button>
      </section>

      <section className="space-y-5">
        <SectionHeader title="Recuperación de leads" />
        <div className="flex items-center justify-between gap-4">
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
      </section>
    </DetailPage>
  );
}
