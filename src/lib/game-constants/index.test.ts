import { describe, it, expect } from "vitest";
import { GAME_CONSTANTS, unitsPerDay, perWorkerUnitsPerDay } from "./index";

describe("game constants", () => {
  it("marca las constantes como no calibradas por defecto", () => {
    expect(GAME_CONSTANTS.calibrated).toBe(false);
  });

  it("convierte production a unidades/día con el factor", () => {
    const c = { ...GAME_CONSTANTS, productionToUnitsPerDay: 2 };
    expect(unitsPerDay(10, c)).toBe(20);
  });

  it("estima producción por trabajador como promedio cuando hay trabajadores", () => {
    // production=12, workerCount=3, factor=1 -> 12/3 = 4 unidades/día por trabajador
    expect(perWorkerUnitsPerDay(12, 3, GAME_CONSTANTS)).toBe(4);
  });

  it("usa el factor directo como producción marginal cuando no hay trabajadores", () => {
    // sin trabajadores, asume 1 punto de producción base * factor
    expect(perWorkerUnitsPerDay(0, 0, { ...GAME_CONSTANTS, productionToUnitsPerDay: 5 })).toBe(5);
  });
});
