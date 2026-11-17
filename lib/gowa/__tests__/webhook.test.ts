import { describe, expect, it } from "vitest";
import { createHmac } from "crypto";
import { bareJid, chatKey, gowaSignatureValid, isDirectChat, parseGowaEvent, phoneOfJid } from "../webhook";

const sign = (body: string, secret: string) => `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
const NOW = new Date("2026-11-17T12:00:00Z");

describe("gowaSignatureValid", () => {
  const body = JSON.stringify({ event: "message" });
  it("acepta la firma del secreto de la cuenta", () => {
    expect(gowaSignatureValid(body, sign(body, "s3cret"), "s3cret")).toBe(true);
  });
  it("rechaza otro secreto, otro cuerpo, cabecera ausente o mal formada", () => {
    expect(gowaSignatureValid(body, sign(body, "otro"), "s3cret")).toBe(false);
    expect(gowaSignatureValid(body + " ", sign(body, "s3cret"), "s3cret")).toBe(false);
    expect(gowaSignatureValid(body, null, "s3cret")).toBe(false);
    expect(gowaSignatureValid(body, "sha256=zz", "s3cret")).toBe(false);
    expect(gowaSignatureValid(body, sign(body, ""), "")).toBe(false);
  });
});

describe("direcciones", () => {
  it("solo chats 1:1", () => {
    expect(isDirectChat("5215511112222@s.whatsapp.net")).toBe(true);
    expect(isDirectChat("251556368777322@lid")).toBe(true);
    expect(isDirectChat("120363402106@g.us")).toBe(false);
    expect(isDirectChat("status@broadcast")).toBe(false);
    expect(isDirectChat("123@newsletter")).toBe(false);
  });
  it("quita el sufijo de dispositivo y saca el número", () => {
    expect(bareJid("5215511112222:12@s.whatsapp.net")).toBe("5215511112222@s.whatsapp.net");
    expect(phoneOfJid("5215511112222@s.whatsapp.net")).toBe("5215511112222");
    expect(phoneOfJid("251556368777322@lid")).toBeNull();
  });
  it("prefiere el JID de teléfono cuando el chat llega como @lid", () => {
    expect(chatKey({ chat_id: "251556368777322@lid", from: "5215511112222@s.whatsapp.net" })).toBe("5215511112222@s.whatsapp.net");
    expect(chatKey({ chat_id: "251556368777322@lid", recipient_alt: "5215511112222@s.whatsapp.net", is_from_me: true })).toBe("5215511112222@s.whatsapp.net");
    expect(chatKey({ chat_id: "251556368777322@lid" })).toBe("251556368777322@lid");
    expect(chatKey({ chat_id: "120363402106@g.us", from: "5215511112222@s.whatsapp.net" })).toBeNull();
  });
});

describe("parseGowaEvent", () => {
  it("texto entrante", () => {
    const ev = parseGowaEvent({
      event: "message",
      payload: { id: "M1", chat_id: "5215511112222@s.whatsapp.net", from: "5215511112222@s.whatsapp.net", from_name: "Ana", timestamp: "2026-11-17T11:00:00Z", body: "Hola", replied_to_id: "M0" },
    }, NOW);
    expect(ev).toMatchObject({
      kind: "message",
      message: { externalId: "5215511112222@s.whatsapp.net", externalMessageId: "M1", fromMe: false, type: "text", body: "Hola", contactName: "Ana", replyToExternalId: "M0", hasMedia: false },
    });
    if (ev.kind === "message") expect(ev.message.timestamp.toISOString()).toBe("2026-11-17T11:00:00.000Z");
  });

  it("medio sin texto queda como [tipo] y con caption cuando lo trae", () => {
    const sinTexto = parseGowaEvent({ event: "message", payload: { id: "M2", chat_id: "5215511112222@s.whatsapp.net", audio: { url: "https://mmg.whatsapp.net/x" } } }, NOW);
    expect(sinTexto).toMatchObject({ kind: "message", message: { type: "audio", body: "[audio]", caption: null, hasMedia: true } });
    const conTexto = parseGowaEvent({ event: "message", payload: { id: "M3", chat_id: "5215511112222@s.whatsapp.net", body: "Mira", image: { url: "u", caption: "Mira" } } }, NOW);
    expect(conTexto).toMatchObject({ kind: "message", message: { type: "image", body: "Mira", caption: "Mira" } });
    const doc = parseGowaEvent({ event: "message", payload: { id: "M4", chat_id: "5215511112222@s.whatsapp.net", document: { url: "u", filename: "cotizacion.pdf" } } }, NOW);
    expect(doc).toMatchObject({ kind: "message", message: { type: "document", filename: "cotizacion.pdf" } });
  });

  it("mensaje propio (escrito desde el teléfono)", () => {
    const ev = parseGowaEvent({ event: "message", payload: { id: "M5", chat_id: "5215511112222@s.whatsapp.net", from: "5215599998888@s.whatsapp.net", is_from_me: true, body: "Te llamo" } }, NOW);
    expect(ev).toMatchObject({ kind: "message", message: { fromMe: true, externalId: "5215511112222@s.whatsapp.net" } });
  });

  it("ignora grupos y mensajes sin id", () => {
    expect(parseGowaEvent({ event: "message", payload: { id: "G", chat_id: "1203@g.us", body: "x" } }, NOW).kind).toBe("ignored");
    expect(parseGowaEvent({ event: "message", payload: { chat_id: "5215511112222@s.whatsapp.net", body: "x" } }, NOW).kind).toBe("ignored");
  });

  it("botón o lista elegida", () => {
    const ev = parseGowaEvent({ event: "message", payload: { id: "M6", chat_id: "5215511112222@s.whatsapp.net", body: "Sí", selection: { selected_id: "opt-1" } } }, NOW);
    expect(ev).toMatchObject({ kind: "message", message: { interactiveReplyId: "opt-1" } });
  });

  it("acuses del contacto; los propios se ignoran", () => {
    expect(parseGowaEvent({ event: "message.ack", payload: { ids: ["A", "B"], receipt_type: "read" } }, NOW)).toEqual({ kind: "ack", ids: ["A", "B"], status: "read" });
    expect(parseGowaEvent({ event: "message.ack", payload: { ids: ["A"], receipt_type: "delivered" } }, NOW)).toEqual({ kind: "ack", ids: ["A"], status: "delivered" });
    expect(parseGowaEvent({ event: "message.ack", payload: { ids: ["A"], receipt_type: "read", is_from_me: true } }, NOW).kind).toBe("ignored");
    expect(parseGowaEvent({ event: "message.ack", payload: { ids: ["A"], receipt_type: "played" } }, NOW).kind).toBe("ignored");
  });

  it("reacción y borrado", () => {
    expect(parseGowaEvent({ event: "message.reaction", payload: { chat_id: "5215511112222@s.whatsapp.net", reaction: "👍", reacted_message_id: "M1" } }, NOW))
      .toEqual({ kind: "reaction", externalId: "5215511112222@s.whatsapp.net", targetId: "M1", emoji: "👍" });
    expect(parseGowaEvent({ event: "message.reaction", payload: { chat_id: "5215511112222@s.whatsapp.net", reaction: "", reacted_message_id: "M1" } }, NOW))
      .toMatchObject({ kind: "reaction", emoji: null });
    expect(parseGowaEvent({ event: "message.revoked", payload: { chat_id: "5215511112222@s.whatsapp.net", revoked_message_id: "M1" } }, NOW))
      .toEqual({ kind: "revoked", externalId: "5215511112222@s.whatsapp.net", targetId: "M1" });
  });

  it("eventos del número", () => {
    expect(parseGowaEvent({ event: "device.logged_out", payload: { code: 401, reason: "logged out from another device" } }, NOW))
      .toEqual({ kind: "logged_out", reason: "logged out from another device" });
    const ban = parseGowaEvent({ event: "device.temporary_ban", payload: { code: 101, reason: "too many", expires_at: "2026-11-18T12:00:00Z" } }, NOW);
    expect(ban).toMatchObject({ kind: "temporary_ban", reason: "too many" });
    if (ban.kind === "temporary_ban") expect(ban.until?.toISOString()).toBe("2026-11-18T12:00:00.000Z");
    expect(parseGowaEvent({ event: "device.reachout_timelock", payload: { is_active: false } }, NOW)).toMatchObject({ kind: "reachout_timelock", active: false });
    expect(parseGowaEvent({ event: "presence", payload: {} }, NOW).kind).toBe("ignored");
  });
});
