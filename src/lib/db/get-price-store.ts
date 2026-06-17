import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { SqlitePriceStore } from "./price-store";
import type { PriceHistoryStore } from "./price-store";

let instance: PriceHistoryStore | null = null;

/** Store de histórico por defecto (SQLite en disco). Crea el directorio si falta. */
export function getPriceStore(): PriceHistoryStore {
  if (!instance) {
    const path = process.env.PRICE_DB_PATH ?? "data/prices.db";
    mkdirSync(dirname(path), { recursive: true });
    instance = new SqlitePriceStore(path);
  }
  return instance;
}
