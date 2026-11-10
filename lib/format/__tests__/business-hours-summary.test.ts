import { describe, expect, it } from "vitest";
import { businessDaysLabel, businessHoursSummary } from "../business-hours-summary";

describe("businessDaysLabel", () => {
  it("agrupa días seguidos con la semana empezando en lunes", () => {
    expect(businessDaysLabel([1, 2, 3, 4, 5, 6])).toBe("Lun–Sáb");
    expect(businessDaysLabel([1, 2, 3, 4, 5])).toBe("Lun–Vie");
    expect(businessDaysLabel([6, 0])).toBe("Sáb, Dom");
    expect(businessDaysLabel([1, 3, 5])).toBe("Lun, Mié, Vie");
    expect(businessDaysLabel([0, 1, 2, 3, 4, 5, 6])).toBe("Todos los días");
  });
});

describe("businessHoursSummary", () => {
  it("resume días, horas y zona", () => {
    expect(businessHoursSummary({ timezone: "America/Mexico_City", businessHourStart: 9, businessHourEnd: 19, businessDays: [1, 2, 3, 4, 5, 6] })).toBe("Lun–Sáb, 9:00–19:00, Ciudad de México");
  });
});
