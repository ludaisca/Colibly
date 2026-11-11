import { describe, expect, it } from "vitest";
import { buildChannelChatWhere, buildWaChatWhere, parseChatListFilters } from "../query";

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

describe("filtro awaiting (Esperando respuesta)", () => {
  it("solo se activa con awaiting=1", () => {
    expect(parseChatListFilters(new URLSearchParams("awaiting=1"), "u").awaiting).toBe(true);
    expect(parseChatListFilters(new URLSearchParams("awaiting=0"), "u").awaiting).toBeUndefined();
  });

  it("va en AND y no pisa el OR de la búsqueda (WhatsApp y canales)", () => {
    const filters = parseChatListFilters(new URLSearchParams("awaiting=1&search=ana"), "u");
    const wa = buildWaChatWhere(filters, ["acc-1"]);
    expect(wa.OR).toHaveLength(3);
    expect(wa.AND).toContainEqual({ waitingSince: { not: null }, status: { not: "RESOLVED" } });
    const ch = buildChannelChatWhere(filters, ["ch-1"], "WEBCHAT")!;
    expect(ch.OR).toHaveLength(3);
    expect(ch.AND).toContainEqual({ waitingSince: { not: null }, status: { not: "RESOLVED" } });
  });
});

describe("alcance por cuenta", () => {
  it("un accountId ajeno no amplía el alcance", () => {
    const filters = parseChatListFilters(new URLSearchParams("accountId=ajena"), "u");
    expect(buildWaChatWhere(filters, ["acc-1"]).accountId).toEqual({ in: [] });
    expect(buildChannelChatWhere(filters, ["ch-1"], "TELEGRAM")!.channelAccountId).toEqual({ in: [] });
  });

  it("un accountId propio se usa tal cual", () => {
    const filters = parseChatListFilters(new URLSearchParams("accountId=acc-1"), "u");
    expect(buildWaChatWhere(filters, ["acc-1"]).accountId).toBe("acc-1");
  });
});

import { chatListOrderBy, parseChatListFilters as parseFilters } from "../query";
import { chatRowComparator } from "../sort";

describe("orden de la lista de chats", () => {
  it("Esperando: quien lleva más rato esperando primero, con desempate estable", () => {
    expect(chatListOrderBy({ awaiting: true })).toEqual([
      { waitingSince: { sort: "asc", nulls: "last" } },
      { lastMessageAt: { sort: "asc", nulls: "last" } },
      { id: "asc" },
    ]);
  });
  it("sort=oldest: último mensaje más viejo arriba; por defecto, el más reciente", () => {
    expect(chatListOrderBy({ sort: "oldest" })[0]).toEqual({ lastMessageAt: { sort: "asc", nulls: "last" } });
    expect(chatListOrderBy({})[0]).toEqual({ lastMessageAt: { sort: "desc", nulls: "last" } });
    expect(parseFilters(new URLSearchParams("sort=oldest"), "u").sort).toBe("oldest");
    expect(parseFilters(new URLSearchParams("sort=raro"), "u").sort).toBeUndefined();
  });
  it("el comparador del cliente da el mismo orden que la base", () => {
    const rows = [
      { id: "a", waitingSince: "2026-11-10T10:00:00Z", lastMessageAt: "2026-11-10T10:00:00Z" },
      { id: "b", waitingSince: null, lastMessageAt: "2026-11-11T09:00:00Z" },
      { id: "c", waitingSince: "2026-11-09T08:00:00Z", lastMessageAt: "2026-11-09T08:00:00Z" },
      { id: "d", waitingSince: null, lastMessageAt: null },
    ];
    expect([...rows].sort(chatRowComparator({ awaiting: true })).map((r) => r.id)).toEqual(["c", "a", "b", "d"]);
    expect([...rows].sort(chatRowComparator({ sort: "oldest" })).map((r) => r.id)).toEqual(["c", "a", "b", "d"]);
    expect([...rows].sort(chatRowComparator({})).map((r) => r.id)).toEqual(["b", "a", "c", "d"]);
  });
});
