import { describe, expect, it } from "vitest";
import { directReplyRoute, commentPostUrl, isCommentChannel, publicReplyTarget, type CommentThreadFacts } from "../comment-rules";

const NOW = new Date("2026-11-18T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const H = 60 * 60 * 1000;
const D = 24 * H;

function facts(over: Partial<CommentThreadFacts>): CommentThreadFacts {
  return { latestInbound: null, privatelyAnswered: new Set(), lastDirectInboundAt: null, now: NOW, ...over };
}
const comment = (id: string, at: Date) => ({ isFromComment: true, externalMessageId: id, timestamp: at });

describe("directReplyRoute", () => {
  it("un DM normal sale como mensaje (Meta aplica su ventana)", () => {
    expect(directReplyRoute(facts({ latestInbound: { isFromComment: false, externalMessageId: "m1", timestamp: ago(H) } }))).toEqual({ kind: "message" });
    expect(directReplyRoute(facts({}))).toEqual({ kind: "message" });
  });

  it("comentario sin responder y reciente: respuesta privada a ese comentario", () => {
    expect(directReplyRoute(facts({ latestInbound: comment("c1", ago(2 * D)) }))).toEqual({ kind: "private_reply", commentId: "c1" });
  });

  it("ya respondido en privado y la persona no ha contestado: bloqueado", () => {
    const r = directReplyRoute(facts({ latestInbound: comment("c1", ago(H)), privatelyAnswered: new Set(["c1"]) }));
    expect(r.kind).toBe("blocked");
    expect(r.kind === "blocked" && r.code).toBe("awaiting_reply");
  });

  it("ya respondido pero la persona escribió por Messenger hace menos de 24 h: mensaje normal", () => {
    expect(directReplyRoute(facts({ latestInbound: comment("c1", ago(H)), privatelyAnswered: new Set(["c1"]), lastDirectInboundAt: ago(3 * H) }))).toEqual({ kind: "message" });
  });

  it("DM de hace más de 24 h no reabre la ventana", () => {
    const r = directReplyRoute(facts({ latestInbound: comment("c1", ago(H)), privatelyAnswered: new Set(["c1"]), lastDirectInboundAt: ago(25 * H) }));
    expect(r.kind).toBe("blocked");
  });

  it("comentario de más de 7 días: ya no hay respuesta privada", () => {
    const r = directReplyRoute(facts({ latestInbound: comment("c1", ago(7 * D + H)) }));
    expect(r.kind === "blocked" && r.code).toBe("comment_expired");
  });

  it("un comentario nuevo permite otra respuesta privada aunque el anterior ya se respondió", () => {
    expect(directReplyRoute(facts({ latestInbound: comment("c2", ago(H)), privatelyAnswered: new Set(["c1"]) }))).toEqual({ kind: "private_reply", commentId: "c2" });
  });
});

describe("auxiliares", () => {
  it("canales con comentarios", () => {
    expect(isCommentChannel("MESSENGER")).toBe(true);
    expect(isCommentChannel("INSTAGRAM")).toBe(true);
    expect(isCommentChannel("TELEGRAM")).toBe(false);
  });

  it("respuesta pública al último comentario", () => {
    expect(publicReplyTarget({ externalMessageId: "c9" })).toBe("c9");
    expect(publicReplyTarget(null)).toBeNull();
  });

  it("enlace a la publicación solo con ids de Meta", () => {
    expect(commentPostUrl("1234_5678")).toBe("https://www.facebook.com/1234_5678");
    expect(commentPostUrl("https://www.instagram.com/p/DAbc123_x/")).toBe("https://www.instagram.com/p/DAbc123_x/");
    expect(commentPostUrl("17895695668004550")).toBeNull(); // id de media de Instagram sin permalink
    expect(commentPostUrl("https://evil.test/p/1")).toBeNull();
    expect(commentPostUrl("javascript:alert(1)")).toBeNull();
    expect(commentPostUrl(null)).toBeNull();
  });
});
