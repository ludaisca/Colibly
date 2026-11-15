import { describe, expect, it } from "vitest";
import { applyMove, dropTargetStage, revertMove } from "../board-move";

const stages = [
  { id: "nuevo", outcome: "OPEN" as const },
  { id: "propuesta", outcome: "OPEN" as const },
  { id: "ganado", outcome: "WON" as const },
];
const card = (id: string, stageId: string, value: number | null = null): { id: string; stageId: string; dealValueCents: number | null; closed?: boolean } => ({ id, stageId, dealValueCents: value });
const board = () => ({ nuevo: [card("a", "nuevo", 10000), card("b", "nuevo")], propuesta: [card("c", "propuesta", 5000)], ganado: [] });
const totals = () => ({ nuevo: { count: 7, valueCents: 10000 }, propuesta: { count: 1, valueCents: 5000 }, ganado: { count: 0, valueCents: 0 } });

describe("dropTargetStage", () => {
  it("lee la columna del id del droppable", () => {
    expect(dropTargetStage("column-propuesta", stages)).toBe("propuesta");
  });
  it("ignora destinos que no son columnas del embudo", () => {
    expect(dropTargetStage("column-otra", stages)).toBeNull();
    expect(dropTargetStage(null, stages)).toBeNull();
  });
});

describe("applyMove", () => {
  it("mueve la tarjeta arriba de la columna destino y ajusta conteos y montos", () => {
    const move = applyMove(board(), totals(), "a", "propuesta", stages)!;
    expect(move.board.nuevo.map((c) => c.id)).toEqual(["b"]);
    expect(move.board.propuesta.map((c) => c.id)).toEqual(["a", "c"]);
    expect(move.board.propuesta[0].stageId).toBe("propuesta");
    expect(move.totals.nuevo).toEqual({ count: 6, valueCents: 0 });
    expect(move.totals.propuesta).toEqual({ count: 2, valueCents: 15000 });
  });
  it("marca cerrada la tarjeta que llega a una etapa ganada o perdida", () => {
    const move = applyMove(board(), totals(), "b", "ganado", stages)!;
    expect(move.board.ganado[0].closed).toBe(true);
  });
  it("no hace nada si se suelta en la misma columna o la tarjeta no existe", () => {
    expect(applyMove(board(), totals(), "a", "nuevo", stages)).toBeNull();
    expect(applyMove(board(), totals(), "zz", "propuesta", stages)).toBeNull();
    expect(applyMove(board(), totals(), "a", "no-existe", stages)).toBeNull();
  });
});

describe("revertMove", () => {
  it("si el guardado falla, la tarjeta y los totales vuelven a como estaban", () => {
    const move = applyMove(board(), totals(), "a", "propuesta", stages)!;
    const back = revertMove(move.board, move.totals, move);
    expect(back.board.nuevo.map((c) => c.id)).toEqual(["a", "b"]);
    expect(back.board.propuesta.map((c) => c.id)).toEqual(["c"]);
    expect(back.totals).toEqual(totals());
  });
});
