import { describe, expect, it } from "vitest";
import { waitingClock, waitingSpoken } from "../waiting-shared";

describe("waitingClock (cifra del tablero de espera)", () => {
  it("formatea horas y minutos con dos dígitos", () => {
    expect(waitingClock(0)).toBe("0:00");
    expect(waitingClock(9)).toBe("0:09");
    expect(waitingClock(72)).toBe("1:12");
    expect(waitingClock(24 * 60 - 1)).toBe("23:59");
  });
  it("desde un día muestra días", () => {
    expect(waitingClock(24 * 60)).toBe("1d");
    expect(waitingClock(3 * 24 * 60 + 5)).toBe("3d");
  });
  it("no acepta negativos ni fracciones", () => {
    expect(waitingClock(-5)).toBe("0:00");
    expect(waitingClock(9.9)).toBe("0:09");
  });
});

describe("waitingSpoken", () => {
  it("lee la espera completa", () => {
    expect(waitingSpoken(0)).toBe("Espera menos de un minuto");
    expect(waitingSpoken(38)).toBe("Espera 38 min");
    expect(waitingSpoken(60)).toBe("Espera 1 h");
    expect(waitingSpoken(72)).toBe("Espera 1 h 12 min");
    expect(waitingSpoken(24 * 60)).toBe("Espera 1 día");
    expect(waitingSpoken(2 * 24 * 60)).toBe("Espera 2 días");
  });
});
