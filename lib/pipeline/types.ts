// Forma (JSON) de lo que devuelve /api/crm/deals/board, compartida por el
// tablero y sus tarjetas. Sin dependencias de servidor: se importa desde el cliente.

export type DealOutcome = "OPEN" | "WON" | "LOST";

export interface BoardDeal {
  id: string;
  title: string;
  amount: number;
  weightedAmount: number;
  probabilityEffective: number;
  status: DealOutcome;
  stageId: string;
  version: number;
  personId: string;
  contactId: string | null;
  ownerId: string | null;
  stageEnteredAt: string;
  expectedCloseDate: string | null;
  leadOrigin: "ORGANIC" | "INSTANT_FORM" | "CTWA";
  source: string | null;
  person: { id: string; name: string };
  company: { id: string; name: string } | null;
  owner: { id: string; name: string } | null;
}

export interface BoardStage {
  id: string;
  name: string;
  color: string;
  outcome: DealOutcome;
  probability: number;
  position: number;
}

export interface BoardColumn {
  stage: BoardStage;
  count: number;
  amount: number;
  weighted: number;
  items: BoardDeal[];
  nextCursor: string | null;
}

export interface BoardResponse {
  currency: string;
  pipeline: { id: string; name: string; isDefault: boolean; archived: boolean };
  columns: BoardColumn[];
}
