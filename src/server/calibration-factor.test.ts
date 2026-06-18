import { describe, it, expect } from "vitest";
import { rateFactorFrom } from "./calibration-factor";

describe("rateFactorFrom", () => {
  it("sin calibración → 1 (sin corrección)", () => {
    expect(rateFactorFrom(null)).toBe(1);
  });
  it("con calibración válida → su factor", () => {
    expect(rateFactorFrom({ factor: 0.8, samples: 3, updatedAt: 1 })).toBeCloseTo(0.8);
  });
  it("factor inválido (<=0) → 1", () => {
    expect(rateFactorFrom({ factor: 0, samples: 1, updatedAt: 1 })).toBe(1);
  });
});
