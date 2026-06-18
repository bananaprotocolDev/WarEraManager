import { describe, it, expect } from "vitest";
import { SqliteCalibrationStore } from "./calibration-store";

function store() {
  return new SqliteCalibrationStore(":memory:");
}

describe("SqliteCalibrationStore", () => {
  it("devuelve null cuando no hay calibración", () => {
    expect(store().get()).toBeNull();
  });

  it("guarda y devuelve la última calibración", () => {
    const s = store();
    s.set({ factor: 0.95, samples: 12, updatedAt: 1000 });
    expect(s.get()).toEqual({ factor: 0.95, samples: 12, updatedAt: 1000 });
  });

  it("set reemplaza la calibración previa (fila única)", () => {
    const s = store();
    s.set({ factor: 1, samples: 1, updatedAt: 1 });
    s.set({ factor: 1.1, samples: 5, updatedAt: 2 });
    expect(s.get()).toEqual({ factor: 1.1, samples: 5, updatedAt: 2 });
  });
});
