/**
 * Toma un snapshot de precios y lo guarda en el histórico (SQLite).
 * Uso local: `npm run collect`. Programalo con el cron de tu SO cada 15–30 min,
 * o al desplegar usá Vercel Cron apuntando a /api/cron/collect-prices.
 */
import { WareraClient } from "../src/lib/warera/client";
import { collectPrices } from "../src/server/collect-prices";
import { getPriceStore } from "../src/lib/db/get-price-store";

async function main() {
  const n = await collectPrices(new WareraClient(), getPriceStore());
  console.log(`Snapshot guardado: ${n} items @ ${new Date().toISOString()}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
