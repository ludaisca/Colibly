import { describe, expect, it } from "vitest";
import { ApiError, readPageParams } from "../respond";
import { API_PAGE_DEFAULT, API_PAGE_MAX } from "../constants";

const u = (q: string) => new URL(`https://x.test/api/v1/contacts${q}`);

describe("readPageParams", () => {
  it("usa el default sin limit", () => {
    expect(readPageParams(u("")).limit).toBe(API_PAGE_DEFAULT);
    expect(readPageParams(u("?limit=")).limit).toBe(API_PAGE_DEFAULT);
  });
  it("acepta enteros y recorta al máximo", () => {
    expect(readPageParams(u("?limit=7&cursor=abc"))).toEqual({ limit: 7, cursor: "abc" });
    expect(readPageParams(u("?limit=100000")).limit).toBe(API_PAGE_MAX);
  });
  it("responde 400 a un limit que no es entero positivo", () => {
    for (const bad of ["abc", "0", "-3", "2.5", "1e2"]) {
      expect(() => readPageParams(u(`?limit=${bad}`))).toThrow(ApiError);
    }
  });
});
