import type { WareraClient } from "@/lib/warera/client";
import type { CalibrationStore } from "@/lib/db/calibration-store";
import { realizedSalesPerDay } from "./sell-rate";

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

/** Calibra el factor producción→unidades comparando ventas reales vs producción. */
export async function runCalibration(
  client: WareraClient,
  store: CalibrationStore,
  opts: RunCalibrationOptions,
): Promise<CalibrationResult> {
  const now = opts.now ?? Date.now();

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
    const realized = await realizedSalesPerDay(client, opts.userId, itemCode, opts.days, now);
    const realizedPerDay = realized ?? 0;
    rows.push({ itemCode, productionPerDay: production, realizedPerDay });
    if (realized !== null) {
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
