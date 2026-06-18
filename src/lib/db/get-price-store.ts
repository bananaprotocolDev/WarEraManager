import { neon } from "@neondatabase/serverless";
import { PostgresPriceHistoryStore, type SqlExec } from "./price-store";
import type { PriceHistoryStore } from "./price-store";

let instance: PriceHistoryStore | null = null;

export function getPriceStore(): PriceHistoryStore {
  if (!instance) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL no está configurada");
    instance = new PostgresPriceHistoryStore(neon(url) as unknown as SqlExec);
  }
  return instance;
}
