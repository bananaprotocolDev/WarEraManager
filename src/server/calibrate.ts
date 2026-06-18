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

  // Agrupar producción por itemCode: si hay varias empresas del mismo item, sus ventas
  // son las mismas transacciones; consultarlas una sola vez evita el doble conteo.
  const productionByItem = new Map<string, number>();
  for (const companyId of list.items) {
    const c = await client.getCompanyById(companyId);
    if (c.production <= 0) continue;
    productionByItem.set(c.itemCode, (productionByItem.get(c.itemCode) ?? 0) + c.production);
  }

  const rows: CalibrationRow[] = [];
  let totalProduction = 0;
  let totalRealized = 0;
  let samples = 0;

  for (const [itemCode, production] of productionByItem) {
    // Sumar unidades vendidas por el usuario dentro de la ventana (paginando, una vez por item).
    // Asunción: la API pagina las transacciones de la más nueva a la más vieja.
    let soldQty = 0;
    let hadSale = false;
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await client.getUserItemTransactions(opts.userId, itemCode, cursor);
      let reachedOld = false;
      for (const tx of res.items) {
        const ts = tx.createdAt ? Date.parse(tx.createdAt) : NaN;
        if (Number.isNaN(ts)) continue; // sin fecha válida: no se cuenta
        if (ts < since) {
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
    rows.push({ itemCode, productionPerDay: production, realizedPerDay });
    if (hadSale) {
      totalProduction += production;
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
