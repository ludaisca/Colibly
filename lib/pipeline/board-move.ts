// Mover una tarjeta del embudo entre columnas, como función pura: la usan el
// arrastre y el menú ⋯ de la tarjeta (misma acción, QA-020). Optimista: el
// tablero cambia antes de guardar y `revertMove` lo deshace si el PATCH falla.

export interface MovableCard {
  id: string;
  stageId: string;
  dealValueCents: number | null;
  closed?: boolean;
}

export interface MoveStage {
  id: string;
  outcome: "OPEN" | "WON" | "LOST";
}

export type MoveTotals = Record<string, { count: number; valueCents: number; partialValue?: boolean }>;

export interface BoardMove<C extends MovableCard> {
  board: Record<string, C[]>;
  totals: MoveTotals;
  card: C;
  from: string;
  to: string;
}

/**
 * Etapa destino de un arrastre. Droppables: la columna ("column-<stageId>") y,
 * en el teléfono, donde solo se ve una columna, el botón de la etapa
 * ("tab-<stageId>").
 */
export function dropTargetStage(overId: string | number | null | undefined, stages: { id: string }[]): string | null {
  if (overId === null || overId === undefined) return null;
  const id = String(overId).replace(/^(column|tab)-/, "");
  return stages.some((stage) => stage.id === id) ? id : null;
}

function shift(totals: MoveTotals, from: string, to: string, valueCents: number): MoveTotals {
  return {
    ...totals,
    [from]: { ...totals[from], count: Math.max((totals[from]?.count ?? 1) - 1, 0), valueCents: (totals[from]?.valueCents ?? 0) - valueCents },
    [to]: { ...totals[to], count: (totals[to]?.count ?? 0) + 1, valueCents: (totals[to]?.valueCents ?? 0) + valueCents },
  };
}

/** Aplica el movimiento; null si la tarjeta no está en el tablero o ya está en esa etapa. */
export function applyMove<C extends MovableCard>(
  board: Record<string, C[]>,
  totals: MoveTotals,
  cardId: string,
  targetStageId: string,
  stages: MoveStage[]
): BoardMove<C> | null {
  const target = stages.find((stage) => stage.id === targetStageId);
  if (!target) return null;
  const from = stages.find((stage) => board[stage.id]?.some((card) => card.id === cardId))?.id;
  if (!from || from === targetStageId) return null;
  const card = board[from].find((item) => item.id === cardId)!;
  const moved = { ...card, stageId: targetStageId, closed: target.outcome !== "OPEN" };
  return {
    board: {
      ...board,
      [from]: board[from].filter((item) => item.id !== cardId),
      // Arriba de la columna destino: el tablero ordena por actividad reciente.
      [targetStageId]: [moved, ...(board[targetStageId] ?? [])],
    },
    totals: shift(totals, from, targetStageId, card.dealValueCents ?? 0),
    card,
    from,
    to: targetStageId,
  };
}

/** Deshace un movimiento (el guardado falló): la tarjeta vuelve a su columna. */
export function revertMove<C extends MovableCard>(board: Record<string, C[]>, totals: MoveTotals, move: BoardMove<C>): { board: Record<string, C[]>; totals: MoveTotals } {
  return {
    board: {
      ...board,
      [move.to]: (board[move.to] ?? []).filter((item) => item.id !== move.card.id),
      [move.from]: [move.card, ...(board[move.from] ?? []).filter((item) => item.id !== move.card.id)],
    },
    totals: shift(totals, move.to, move.from, move.card.dealValueCents ?? 0),
  };
}
