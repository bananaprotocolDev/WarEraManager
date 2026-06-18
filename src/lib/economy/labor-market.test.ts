import { describe, it, expect } from "vitest";
import { summarizeLaborMarket } from "./labor-market";

describe("summarizeLaborMarket", () => {
  it("calcula medianas de wage/minProduction/minEnergy", () => {
    const s = summarizeLaborMarket([
      { wage: 0.1, minProduction: 40, minEnergy: 50 },
      { wage: 0.2, minProduction: 50, minEnergy: 60 },
      { wage: 0.3, minProduction: 60, minEnergy: 70 },
    ]);
    expect(s.count).toBe(3);
    expect(s.medianWage).toBeCloseTo(0.2);
    expect(s.medianMinProduction).toBe(50);
    expect(s.medianMinEnergy).toBe(60);
  });

  it("lista vacía → count 0 y nulls", () => {
    const s = summarizeLaborMarket([]);
    expect(s.count).toBe(0);
    expect(s.medianWage).toBeNull();
  });

  it("ignora campos ausentes al promediar", () => {
    const s = summarizeLaborMarket([{ wage: 0.2 }, { minProduction: 50 }]);
    expect(s.medianWage).toBeCloseTo(0.2);
    expect(s.medianMinProduction).toBe(50);
  });
});
