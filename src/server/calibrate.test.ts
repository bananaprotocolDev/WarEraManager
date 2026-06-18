import { describe, it, expect } from "vitest";
import { runCalibration } from "./calibrate";
import type { CalibrationStore, Calibration } from "@/lib/db/calibration-store";

function fakeStore() {
  let saved: Calibration | null = null;
  const store: CalibrationStore = { get: () => saved, set: (c) => (saved = c) };
  return { store, get: () => saved };
}

const NOW = Date.parse("2026-06-10T00:00:00.000Z");
const recent = "2026-06-09T00:00:00.000Z"; // dentro de 7 días

function fakeClient(over: Partial<Record<string, unknown>> = {}) {
  return {
    getUserCompanies: async () => ({ items: ["c1"] }),
    getCompanyById: async () => ({ _id: "c1", itemCode: "steel", production: 100, workerCount: 0, activeUpgradeLevels: { automatedEngine: 0, breakRoom: 0 } }),
    getUserItemTransactions: async () => ({
      items: [
        { sellerId: "u1", quantity: 350, createdAt: recent },
        { sellerId: "OTHER", quantity: 999, createdAt: recent }, // compra de otro: se ignora
      ],
      nextCursor: null,
    }),
    ...over,
  } as never;
}

describe("runCalibration", () => {
  it("deriva factor = unidades vendidas/día ÷ producción y lo persiste", async () => {
    const { store, get } = fakeStore();
    const r = await runCalibration(fakeClient(), store, { userId: "u1", days: 7, now: NOW });
    // vendidas = 350 en 7 días = 50/día ; producción = 100 ; factor = 0.5
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(r.factor).toBeCloseTo(0.5);
    expect(r.rows[0]).toMatchObject({ itemCode: "steel", productionPerDay: 100, realizedPerDay: 50 });
    expect(get()?.factor).toBeCloseTo(0.5);
  });

  it("sin ventas en la ventana → no persiste y reporta insuficiente", async () => {
    const { store, get } = fakeStore();
    const client = fakeClient({ getUserItemTransactions: async () => ({ items: [], nextCursor: null }) });
    const r = await runCalibration(client, store, { userId: "u1", days: 7, now: NOW });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected not ok");
    expect(r.reason).toBe("insufficient");
    expect(get()).toBeNull();
  });

  it("ignora transacciones fuera de la ventana", async () => {
    const { store } = fakeStore();
    const old = "2026-01-01T00:00:00.000Z";
    const client = fakeClient({
      getUserItemTransactions: async () => ({ items: [{ sellerId: "u1", quantity: 350, createdAt: old }], nextCursor: null }),
    });
    const r = await runCalibration(client, store, { userId: "u1", days: 7, now: NOW });
    expect(r.ok).toBe(false);
  });
});
