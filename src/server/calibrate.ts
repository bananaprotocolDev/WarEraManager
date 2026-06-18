import type { WareraClient } from "@/lib/warera/client";
import type { CalibrationStore } from "@/lib/db/calibration-store";

export interface CalibrationRow {
  itemCode: string;
  productionPerDay: number;
  realizedPerDay: number;
}

export type CalibrationResult =
  | { ok: true; factor: number; samples: number; rows: CalibrationRow[] }
  | { ok: false; reason: "insufficient"; rows: CalibrationRow[] };

export interface RunCalibrationOptions {
  userId: string;
  days: number;
  /** Para tests; default Date.now(). */
  now?: number;
}

const MAX_PAGES = 10;

/** Calibra el factor producción→unidades comparando ventas reales vs producción. */
export async function runCalibration(
  client: WareraClient,
  store: CalibrationStore,
  opts: RunCalibrationOptions,
): Promise<CalibrationResult> {
  const now = opts.now ?? Date.now();
  const since = now - opts.days * 24 * 60 * 60 * 1000;

  const list = await client.getUserCompanies(opts.userId);
  const rows: CalibrationRow[] = [];
  let totalProduction = 0;
  let totalRealized = 0;
  let samples = 0;

  for (const companyId of list.items) {
    const c = await client.getCompanyById(companyId);
    if (c.production <= 0) continue;

    // Sumar unidades vendidas por el usuario dentro de la ventana (paginando).
    let soldQty = 0;
    let hadSale = false;
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await client.getUserItemTransactions(opts.userId, c.itemCode, cursor);
      let reachedOld = false;
      for (const tx of res.items) {
        const ts = tx.createdAt ? Date.parse(tx.createdAt) : NaN;
        if (!Number.isNaN(ts) && ts < since) {
          reachedOld = true;
          continue;
        }
        if (tx.sellerId === opts.userId && typeof tx.quantity === "number") {
          soldQty += tx.quantity;
          hadSale = true;
        }
      }
      cursor = res.nextCursor ?? undefined;
      if (!cursor || reachedOld) break;
    }

    const realizedPerDay = soldQty / opts.days;
    rows.push({ itemCode: c.itemCode, productionPerDay: c.production, realizedPerDay });
    if (hadSale) {
      totalProduction += c.production;
      totalRealized += realizedPerDay;
      samples++;
    }
  }

  if (samples === 0 || totalProduction <= 0 || totalRealized <= 0) {
    return { ok: false, reason: "insufficient", rows };
  }

  const factor = totalRealized / totalProduction;
  store.set({ factor, samples, updatedAt: now });
  return { ok: true, factor, samples, rows };
}
