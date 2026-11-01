import { describe, expect, it } from "vitest";
import { parseChatListFilters } from "../query";

describe("parseChatListFilters", () => {
  it("traduce los filtros de la bandeja", () => {
    const filters = parseChatListFilters(
      new URLSearchParams("assigned=me&priority=HIGH&snoozed=only&status=OPEN,RESOLVED&hasReplied=yes&search= ana "),
      "user-1"
    );

    expect(filters.assignedToId).toBe("user-1");
    expect(filters.priority).toBe("HIGH");
    expect(filters.snoozed).toBe("only");
    expect(filters.statuses).toEqual(["OPEN", "RESOLVED"]);
    expect(filters.hasReplied).toBe("yes");
    expect(filters.search).toBe("ana");
  });

  it("distingue sin asignar de un filtro ausente", () => {
    expect(parseChatListFilters(new URLSearchParams("assigned=unassigned"), "user-1").assignedToId).toBeNull();
    expect(parseChatListFilters(new URLSearchParams(""), "user-1").assignedToId).toBeUndefined();
  });

  it("ignora valores fuera del catálogo", () => {
    const filters = parseChatListFilters(new URLSearchParams("priority=INVENTADA&status=OPEN,BORRADO&snoozed=nope"), "user-1");
    expect(filters.priority).toBeUndefined();
    expect(filters.statuses).toEqual(["OPEN"]);
    expect(filters.snoozed).toBeUndefined();
  });
});
