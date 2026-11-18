import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { waitingLabel, waitingTone } from "../waiting-shared";

describe("waitingTone / waitingLabel", () => {
  it("umbrales 15 y 60 min", () => {
    expect(waitingTone(0)).toBe("muted");
    expect(waitingTone(14)).toBe("muted");
    expect(waitingTone(15)).toBe("warning");
    expect(waitingTone(59)).toBe("warning");
    expect(waitingTone(60)).toBe("danger");
  });

  it("texto corto", () => {
    expect(waitingLabel(0)).toBe("espera ahora");
    expect(waitingLabel(25)).toBe("espera 25 min");
    expect(waitingLabel(180)).toBe("espera 3 h");
    expect(waitingLabel(3000)).toBe("espera 2 d");
  });
});

// Guarda contra regresiones: cada camino que recibe o contesta a un cliente
// debe seguir marcando/limpiando la espera. Si alguien quita una llamada,
// el chat queda "esperando" para siempre (o nunca), y tsc no lo ve.
const ROOT = join(__dirname, "../../..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("puntos que mantienen waitingSince", () => {
  it.each([
    "lib/whatsapp/ingest-message.ts",
    "lib/telegram/ingest-message.ts",
  ])("%s marca la espera", (file) => {
    expect(read(file)).toMatch(/markWaiting\(/);
  });

  it.each([
    "lib/messaging/outbound.ts",
    "lib/whatsapp/coexistence/ingest.ts",
  ])("%s llama a markReplied", (file) => {
    expect(read(file)).toMatch(/markReplied\(/);
  });

  it.each([
    "app/api/whatsapp/chats/[chatId]/send/route.ts",
    "lib/workers/bot-worker.ts",
    "lib/workers/bot-send-worker.ts",
    "lib/channels/bot-worker.ts",
    "lib/chats/actions.ts",
    "app/api/whatsapp/chats/bulk/route.ts",
    "lib/macros/execute.ts",
  ])("%s limpia waitingSince", (file) => {
    expect(read(file)).toMatch(/waitingSince: null/);
  });

  it("la ruta de envío manual limpia la espera en sus 4 ramas", () => {
    expect(read("app/api/whatsapp/chats/[chatId]/send/route.ts").match(/waitingSince: null/g)).toHaveLength(4);
  });
});
