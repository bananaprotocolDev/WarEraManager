import { describe, it, expect } from "vitest";
import { realizedSalesPerDay } from "./sell-rate";

const NOW = Date.parse("2026-06-10T00:00:00.000Z");
const recent = "2026-06-09T00:00:00.000Z";
const old = "2026-01-01T00:00:00.000Z";

function client(items: { sellerId?: string; quantity?: number; createdAt?: string }[]) {
  return { getUserItemTransactions: async () => ({ items, nextCursor: null }) } as never;
}

describe("realizedSalesPerDay", () => {
  it("suma ventas del usuario en la ventana / días", async () => {
    const r = await realizedSalesPerDay(client([
      { sellerId: "u1", quantity: 350, createdAt: recent },
      { sellerId: "OTHER", quantity: 999, createdAt: recent },
    ]), "u1", "steel", 7, NOW);
    expect(r).toBeCloseTo(50); // 350/7
  });

  it("sin ventas → null", async () => {
    const r = await realizedSalesPerDay(client([{ sellerId: "u1", quantity: 5, createdAt: old }]), "u1", "steel", 7, NOW);
    expect(r).toBeNull();
  });
});
