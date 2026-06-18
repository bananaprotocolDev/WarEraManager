import type { WareraClient } from "@/lib/warera/client";

const MAX_PAGES = 10;

/**
 * Unidades vendidas por el usuario (sellerId == userId) de un item, por día, en la ventana.
 * Devuelve null si no hubo ventas en la ventana. Asume paginación de más nuevo a más viejo.
 */
export async function realizedSalesPerDay(
  client: WareraClient,
  userId: string,
  itemCode: string,
  days: number,
  now: number = Date.now(),
): Promise<number | null> {
  const since = now - days * 24 * 60 * 60 * 1000;
  let soldQty = 0;
  let hadSale = false;
  let cursor: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await client.getUserItemTransactions(userId, itemCode, cursor);
    let reachedOld = false;
    for (const tx of res.items) {
      const ts = tx.createdAt ? Date.parse(tx.createdAt) : NaN;
      if (Number.isNaN(ts)) continue;
      if (ts < since) {
        reachedOld = true;
        continue;
      }
      if (tx.sellerId === userId && typeof tx.quantity === "number") {
        soldQty += tx.quantity;
        hadSale = true;
      }
    }
    cursor = res.nextCursor ?? undefined;
    if (!cursor || reachedOld) break;
  }

  return hadSale ? soldQty / days : null;
}
