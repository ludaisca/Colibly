"use client";

import { useState } from "react";
import { Card } from "@/app/components/ui/card";
import { SectionHeader } from "@/app/components/ui/section-header";
import { Segmented } from "@/app/components/ui/segmented";
import { gridMax, heatIntensity, type HeatmapGrid } from "@/lib/estadisticas/heatmap-rules";

// Mapa de calor día × hora en la zona de la organización. El color mezcla el
// acento sobre la superficie (tokens, sin literales) y el número exacto va en
// el title/aria-label de cada celda.

const DAYS: Array<{ dow: number; label: string; long: string }> = [
  { dow: 1, label: "Lun", long: "lunes" },
  { dow: 2, label: "Mar", long: "martes" },
  { dow: 3, label: "Mié", long: "miércoles" },
  { dow: 4, label: "Jue", long: "jueves" },
  { dow: 5, label: "Vie", long: "viernes" },
  { dow: 6, label: "Sáb", long: "sábado" },
  { dow: 0, label: "Dom", long: "domingo" },
];
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

type Mode = "inbound" | "resolved";
const MODE_LABEL: Record<Mode, { tab: string; noun: string }> = {
  inbound: { tab: "Mensajes recibidos", noun: "mensajes recibidos" },
  resolved: { tab: "Chats resueltos", noun: "chats resueltos" },
};

export function ActivityHeatmap({ inbound, resolved, timeZone }: { inbound: HeatmapGrid; resolved: HeatmapGrid; timeZone: string }) {
  const [mode, setMode] = useState<Mode>("inbound");
  const grid = mode === "inbound" ? inbound : resolved;
  const max = gridMax(grid);

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionHeader eyebrow="Actividad" title="Por día y hora" />
        <Segmented
          label="Qué mostrar"
          value={mode}
          onChange={setMode}
          options={(Object.keys(MODE_LABEL) as Mode[]).map((value) => ({ value, label: MODE_LABEL[value].tab }))}
        />
      </div>
      <p className="mt-1 text-xs text-muted">
        Hora local ({timeZone.replace("_", " ")}). Úsalo para decidir horarios y turnos.
      </p>

      {max === 0 ? (
        <p className="py-8 text-center text-sm text-muted-darker">Sin {MODE_LABEL[mode].noun} en el periodo.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] table-fixed border-separate border-spacing-[3px]">
            <caption className="sr-only">{MODE_LABEL[mode].tab} por día de la semana y hora</caption>
            <thead>
              <tr>
                <th scope="col" className="w-10" />
                {HOURS.map((hour) => (
                  <th key={hour} scope="col" className="text-micro font-normal tabular-nums text-muted-darker">
                    {hour % 3 === 0 ? hour : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DAYS.map((day) => (
                <tr key={day.dow}>
                  <th scope="row" className="pr-1 text-left text-micro font-medium text-muted-darker">{day.label}</th>
                  {HOURS.map((hour) => {
                    const count = grid[day.dow][hour];
                    const pct = Math.round(heatIntensity(count, max) * 100);
                    const text = `${day.long} ${hour}:00 – ${count} ${MODE_LABEL[mode].noun}`;
                    return (
                      <td
                        key={hour}
                        title={text}
                        aria-label={text}
                        className="h-6 rounded-[4px] border border-border"
                        style={{
                          backgroundColor: pct === 0 ? "var(--surface)" : `color-mix(in oklab, var(--accent-strong) ${Math.max(pct, 8)}%, var(--surface))`,
                        }}
                      />
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 flex items-center justify-end gap-2 text-micro text-muted-darker" aria-hidden>
            <span>Menos</span>
            {[0, 25, 50, 75, 100].map((step) => (
              <span
                key={step}
                className="h-3 w-5 rounded-[3px] border border-border"
                style={{ backgroundColor: step === 0 ? "var(--surface)" : `color-mix(in oklab, var(--accent-strong) ${step}%, var(--surface))` }}
              />
            ))}
            <span>Más · máx. {max}</span>
          </div>
        </div>
      )}
    </Card>
  );
}
