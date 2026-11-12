import type { LeadStatus, PipelineStageOutcome } from "@prisma/client";

// Reglas puras del tablero del embudo (sin base): repartir los conteos del
// GROUP BY entre las columnas.

export interface StageCountRow {
  pipelineStageId: string | null;
  leadStatus: LeadStatus;
  isSample: boolean;
  count: number;
  valueCents: number;
}

export interface StageSummary {
  /** Tarjetas de la columna (incluye las de ejemplo, que también se ven). */
  count: number;
  /** Suma del valor de esas tarjetas. */
  valueCents: number;
  /** Solo datos reales: lo que cuentan los KPIs. */
  realCount: number;
  realValueCents: number;
}

/**
 * Columna de cada fila: su etapa, o —en el embudo principal, sin etapa— la de
 * su leadStatus. Filas que no caen en ninguna columna se ignoran.
 */
export function summarizeStages(
  rows: StageCountRow[],
  stages: Array<{ id: string; leadStatus: LeadStatus | null; outcome?: PipelineStageOutcome }>,
  isDefault: boolean
): Record<string, StageSummary> {
  const out: Record<string, StageSummary> = {};
  for (const stage of stages) out[stage.id] = { count: 0, valueCents: 0, realCount: 0, realValueCents: 0 };
  for (const row of rows) {
    const stageId = row.pipelineStageId ?? (isDefault ? stages.find((stage) => stage.leadStatus === row.leadStatus)?.id : undefined);
    const summary = stageId ? out[stageId] : undefined;
    if (!summary) continue;
    summary.count += row.count;
    summary.valueCents += row.valueCents;
    if (!row.isSample) {
      summary.realCount += row.count;
      summary.realValueCents += row.valueCents;
    }
  }
  return out;
}
