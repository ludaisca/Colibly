import { describe, expect, it } from "vitest";
import { countsFromAssigneeGroups } from "../counts";

describe("countsFromAssigneeGroups", () => {
  it("parte los activos en míos, sin asignar y todos", () => {
    const groups = [
      { assignedToId: null, count: 10 },
      { assignedToId: "yo", count: 3 },
      { assignedToId: "otra", count: 5 },
    ];
    expect(countsFromAssigneeGroups(groups, "yo", 2)).toEqual({ awaiting: 2, sla: 0, mine: 3, unassigned: 10, all: 18 });
  });

  it("suma los grupos repetidos de WhatsApp y de los canales genéricos", () => {
    const groups = [
      { assignedToId: "yo", count: 1 }, // WhatsApp
      { assignedToId: null, count: 4 },
      { assignedToId: "yo", count: 2 }, // canales
      { assignedToId: null, count: 1 },
    ];
    expect(countsFromAssigneeGroups(groups, "yo", 0)).toEqual({ awaiting: 0, sla: 0, mine: 3, unassigned: 5, all: 8 });
  });

  it("sin chats activos todo es cero", () => {
    expect(countsFromAssigneeGroups([], "yo", 0)).toEqual({ awaiting: 0, sla: 0, mine: 0, unassigned: 0, all: 0 });
  });
});
