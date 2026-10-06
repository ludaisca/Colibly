import { describe, expect, it } from "vitest";
import { isValidPhoneNumber } from "@/app/components/arc/phone-input/phone-input";

describe("beta WhatsApp phone validation", () => {
  it("accepts a complete number for the selected country", () => {
    expect(isValidPhoneNumber("+525512345678")).toBe(true);
    expect(isValidPhoneNumber("+573001234567")).toBe(true);
  });

  it("rejects incomplete, overlong and unrecognized international numbers", () => {
    expect(isValidPhoneNumber("+52551234567")).toBe(false);
    expect(isValidPhoneNumber("+5255123456789")).toBe(false);
    expect(isValidPhoneNumber("+99912345678")).toBe(false);
  });
});
