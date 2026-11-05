import { describe, expect, it } from "vitest";
import { normalizeTeamName, teamCandidateIds } from "../rules";

describe("teamCandidateIds", () => {
  it("sin equipo no filtra", () => expect(teamCandidateIds(["a", "b"], null)).toEqual(["a", "b"]));
  it("con equipo, solo los miembros que eran candidatos (en el mismo orden)", () =>
    expect(teamCandidateIds(["a", "b", "c"], ["c", "a", "z"])).toEqual(["a", "c"]));
  it("equipo sin nadie disponible: nadie (no se manda fuera del equipo)", () => expect(teamCandidateIds(["a"], ["b"])).toEqual([]));
  it("equipo vacío: nadie", () => expect(teamCandidateIds(["a"], [])).toEqual([]));
});

describe("normalizeTeamName", () => {
  it("colapsa espacios", () => expect(normalizeTeamName("  Ventas   Norte ")).toBe("Ventas Norte"));
  it("vacío o muy largo: null", () => {
    expect(normalizeTeamName("   ")).toBeNull();
    expect(normalizeTeamName("x".repeat(51))).toBeNull();
  });
});
