import { describe, expect, it } from "vitest";
import { adjacentIndex, isTypingTarget, matchInboxShortcut, shouldHandleShortcut } from "../shortcuts";

const key = (code: string, mods: Partial<{ alt: boolean; shift: boolean; ctrl: boolean; meta: boolean }> = {}) => ({
  code,
  altKey: !!mods.alt,
  shiftKey: !!mods.shift,
  ctrlKey: !!mods.ctrl,
  metaKey: !!mods.meta,
});

describe("matchInboxShortcut", () => {
  it("Alt + letra por código físico", () => {
    expect(matchInboxShortcut(key("KeyJ", { alt: true }))).toBe("next-chat");
    expect(matchInboxShortcut(key("KeyK", { alt: true }))).toBe("prev-chat");
    expect(matchInboxShortcut(key("KeyE", { alt: true }))).toBe("resolve");
    expect(matchInboxShortcut(key("KeyA", { alt: true }))).toBe("assign-me");
    expect(matchInboxShortcut(key("KeyS", { alt: true }))).toBe("snooze-1h");
  });

  it("sin Alt, J no hace nada", () => {
    expect(matchInboxShortcut(key("KeyJ"))).toBeNull();
  });

  it("/ busca y ? (Shift+/) abre la ayuda", () => {
    expect(matchInboxShortcut(key("Slash"))).toBe("focus-search");
    expect(matchInboxShortcut(key("Slash", { shift: true }))).toBe("help");
  });

  it("Ctrl/Cmd nunca se interceptan", () => {
    expect(matchInboxShortcut(key("KeyE", { alt: true, ctrl: true }))).toBeNull();
    expect(matchInboxShortcut(key("KeyK", { alt: true, meta: true }))).toBeNull();
  });
});

describe("isTypingTarget / shouldHandleShortcut", () => {
  it("campos de texto", () => {
    expect(isTypingTarget({ tagName: "input" })).toBe(true);
    expect(isTypingTarget({ tagName: "TEXTAREA" })).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
    expect(isTypingTarget({ tagName: "BUTTON" })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });

  it("Alt funciona escribiendo; / y ? no", () => {
    expect(shouldHandleShortcut("resolve", { typing: true, dialogOpen: false })).toBe(true);
    expect(shouldHandleShortcut("focus-search", { typing: true, dialogOpen: false })).toBe(false);
    expect(shouldHandleShortcut("help", { typing: false, dialogOpen: false })).toBe(true);
  });

  it("con un diálogo abierto, nada", () => {
    expect(shouldHandleShortcut("next-chat", { typing: false, dialogOpen: true })).toBe(false);
  });
});

describe("adjacentIndex", () => {
  const ids = ["a", "b", "c"];
  it("siguiente y anterior sin dar la vuelta", () => {
    expect(adjacentIndex(ids, "a", 1)).toBe(1);
    expect(adjacentIndex(ids, "c", 1)).toBeNull();
    expect(adjacentIndex(ids, "a", -1)).toBeNull();
    expect(adjacentIndex(ids, "b", -1)).toBe(0);
  });
  it("sin chat abierto: el primero o el último", () => {
    expect(adjacentIndex(ids, null, 1)).toBe(0);
    expect(adjacentIndex(ids, "zzz", -1)).toBe(2);
    expect(adjacentIndex([], null, 1)).toBeNull();
  });
});
