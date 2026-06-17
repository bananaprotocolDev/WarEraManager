import { describe, it, expect } from "vitest";
import { collectPrices } from "./collect-prices";
import type { PriceHistoryStore, PricePoint } from "@/lib/db/price-store";

function fakeStore() {
  const snaps: { prices: Record<string, number>; ts?: number }[] = [];
  const store: PriceHistoryStore = {
    recordSnapshot: (prices, ts) => snaps.push({ prices, ts }),
    getHistory: (): PricePoint[] => [],
    listItems: () => [],
  };
  return { store, snaps };
}

describe("collectPrices", () => {
  it("lee precios del cliente y los guarda como snapshot", async () => {
    const { store, snaps } = fakeStore();
    const client = { getPrices: async () => ({ bread: 1.5, grain: 0.1 }) } as never;
    const n = await collectPrices(client, store);
    expect(n).toBe(2);
    expect(snaps).toHaveLength(1);
    expect(snaps[0].prices).toEqual({ bread: 1.5, grain: 0.1 });
  });
});
