import type { PriceHistoryStore } from "@/lib/db/price-store";
import { averagePrice, priceTrend, type PriceTrendInfo } from "@/lib/economy";
import type { PriceMap } from "@/lib/economy";

/** Tendencia de precio del item según el histórico (null si falta store o datos). */
export async function priceTrendFor(
  store: PriceHistoryStore | undefined,
  itemCode: string,
  prices: PriceMap,
  days = 7,
): Promise<PriceTrendInfo | undefined> {
  if (!store) return undefined;
  const current = prices[itemCode];
  if (current === undefined) return undefined;
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  // No-fatal: si la DB falla (cold start / hipo de Neon), no rompemos el reporte;
  // la tendencia es informativa y simplemente no se muestra.
  try {
    const avg = averagePrice(await store.getHistory(itemCode, since));
    if (avg === null) return undefined;
    return priceTrend(current, avg);
  } catch {
    return undefined;
  }
}
