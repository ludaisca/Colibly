import { describe, it, expect } from "vitest";
import { pgConnectionFromUrl } from "../pg-connection";

describe("pgConnectionFromUrl", () => {
  it("parte la URL en variables PG* e ignora parámetros de Prisma", () => {
    expect(pgConnectionFromUrl("postgresql://postgres:pw@db:5432/colibly_db?schema=public&connection_limit=5")).toEqual({
      PGHOST: "db",
      PGPORT: "5432",
      PGUSER: "postgres",
      PGPASSWORD: "pw",
      PGDATABASE: "colibly_db",
    });
  });
  it("decodifica contraseñas con caracteres especiales", () => {
    const env = pgConnectionFromUrl("postgres://u%40x:p%2Fw%3A%40@host/db");
    expect(env.PGUSER).toBe("u@x");
    expect(env.PGPASSWORD).toBe("p/w:@");
    expect(env.PGPORT).toBe("5432");
  });
  it("respeta sslmode", () => {
    expect(pgConnectionFromUrl("postgresql://u:p@h/db?sslmode=require").PGSSLMODE).toBe("require");
  });
  it("rechaza lo que no es una URL de PostgreSQL", () => {
    expect(() => pgConnectionFromUrl("mysql://u:p@h/db")).toThrow(/postgresql/);
    expect(() => pgConnectionFromUrl("no es url")).toThrow(/válida/);
    expect(() => pgConnectionFromUrl("postgresql://u:p@h/")).toThrow(/host o base/);
  });
});
