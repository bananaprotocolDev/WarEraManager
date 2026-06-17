import { describe, it, expect } from "vitest";
import { formatMoney, formatPerDay, formatPercent } from "./format";

describe("format", () => {
  it("formatMoney usa 2 decimales", () => {
    expect(formatMoney(1234.5)).toBe("1,234.50");
    expect(formatMoney(0)).toBe("0.00");
  });

  it("formatPerDay antepone signo y sufijo /día", () => {
    expect(formatPerDay(28.4)).toBe("+28.40 /día");
    expect(formatPerDay(-3.1)).toBe("-3.10 /día");
    expect(formatPerDay(0)).toBe("0.00 /día");
  });

  it("formatPercent redondea a entero con %", () => {
    expect(formatPercent(0.78)).toBe("78%");
    expect(formatPercent(0.224)).toBe("22%");
  });
});
