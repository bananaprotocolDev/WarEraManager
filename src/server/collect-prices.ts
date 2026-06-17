import type { WareraClient } from "@/lib/warera/client";
import type { PriceHistoryStore } from "@/lib/db/price-store";

/** Toma un snapshot de los precios actuales y lo persiste. Devuelve cuántos items guardó. */
export async function collectPrices(client: WareraClient, store: PriceHistoryStore): Promise<number> {
  const prices = await client.getPrices();
  store.recordSnapshot(prices);
  return Object.keys(prices).length;
}
