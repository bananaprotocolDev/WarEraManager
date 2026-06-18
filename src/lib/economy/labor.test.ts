import { describe, it, expect } from "vitest";
import {
  LABOR_CONSTANTS,
  actionsPerDay,
  workerUnitsPerDay,
  productionValueForLevel,
  levelForProductionValue,
} from "./labor";
import { energyValueForLevel } from "./labor";

describe("labor model", () => {
  it("actionsPerDay = energía × 24 / (regenDividedBy × energyCostPerAction)", () => {
    // energía 100: 100*24/(10*10) = 24 acciones/día
    expect(actionsPerDay(100, LABOR_CONSTANTS)).toBeCloseTo(24);
    expect(actionsPerDay(50, LABOR_CONSTANTS)).toBeCloseTo(12);
  });

  it("workerUnitsPerDay = acciones × producción × (1+fidelidad%) × throughputFactor", () => {
    // energía 50 → 12 acciones ; producción 40 ; fidelidad 0 → 480
    expect(workerUnitsPerDay(40, 50, 0, LABOR_CONSTANTS)).toBeCloseTo(480);
    // fidelidad 10 → 480 * 1.1 = 528
    expect(workerUnitsPerDay(40, 50, 10, LABOR_CONSTANTS)).toBeCloseTo(528);
  });

  it("productionValueForLevel = 10 + 3×nivel; inversa redondea hacia arriba", () => {
    expect(productionValueForLevel(0)).toBe(10);
    expect(productionValueForLevel(10)).toBe(40);
    expect(levelForProductionValue(40)).toBe(10);
    expect(levelForProductionValue(41)).toBe(11); // ceil
    expect(levelForProductionValue(10)).toBe(0);
  });

  it("LABOR_CONSTANTS no calibrado por defecto", () => {
    expect(LABOR_CONSTANTS.calibrated).toBe(false);
    expect(LABOR_CONSTANTS.throughputFactor).toBe(1);
  });
});

describe("energyValueForLevel", () => {
  it("30 base, +10 por nivel", () => {
    expect(energyValueForLevel(0)).toBe(30);
    expect(energyValueForLevel(5)).toBe(80);
  });
});
