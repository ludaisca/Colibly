import { describe, expect, it } from "vitest";
import { GRAPH_API_VERSION, graphUrl } from "../graph";

describe("graphUrl", () => {
  it("usa la versión central y quita barras iniciales", () => {
    expect(graphUrl("/1234/subscribed_apps")).toBe(`https://graph.facebook.com/${GRAPH_API_VERSION}/1234/subscribed_apps`);
  });
  it("agrega parámetros y omite los indefinidos", () => {
    const url = new URL(graphUrl("oauth/access_token", { client_id: "1", code: "abc", redirect_uri: undefined }));
    expect(url.searchParams.get("client_id")).toBe("1");
    expect(url.searchParams.get("code")).toBe("abc");
    expect(url.searchParams.has("redirect_uri")).toBe(false);
  });
});
