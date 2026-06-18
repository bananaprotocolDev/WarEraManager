import { describe, it, expect } from "vitest";
import { gameConstantsFrom } from "./get-constants";

describe("gameConstantsFrom", () => {
  it("sin calibración → constantes por defecto (no calibrado)", () => {
    const c = gameConstantsFrom(null);
    expect(c.productionToUnitsPerDay).toBe(1);
    expect(c.calibrated).toBe(false);
  });

  it("con calibración válida → factor + calibrado", () => {
    const c = gameConstantsFrom({ factor: 0.9, samples: 10, updatedAt: 1 });
    expect(c.productionToUnitsPerDay).toBeCloseTo(0.9);
    expect(c.calibrated).toBe(true);
  });

  it("factor inválido (<=0) → por defecto", () => {
    const c = gameConstantsFrom({ factor: 0, samples: 10, updatedAt: 1 });
    expect(c.calibrated).toBe(false);
  });
});
