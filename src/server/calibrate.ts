import type { WareraClient } from "@/lib/warera/client";
import type { CalibrationStore } from "@/lib/db/calibration-store";
import { realizedSalesPerDay } from "./sell-rate";
import { automationDailyProd, LABOR_CONSTANTS } from "@/lib/economy";
import { companyWorkerOutput } from "./worker-output";

export interface CalibrationRow {
  itemCode: string;
  modeledPerDay: number;
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

/** Calibra el factor tasa modelada→ventas reales comparando ventas reales vs tasa modelada. */
export async function runCalibration(
  client: WareraClient,
  store: CalibrationStore,
  opts: RunCalibrationOptions,
): Promise<CalibrationResult> {
  const now = opts.now ?? Date.now();

  const gameConfig = await client.getGameConfig();
  const list = await client.getUserCompanies(opts.userId);

  // Agrupar tasa modelada por itemCode: si hay varias empresas del mismo item, sus ventas
  // son las mismas transacciones; consultarlas una sola vez evita el doble conteo.
  const modeledByItem = new Map<string, number>();
  for (const companyId of list.items) {
    const c = await client.getCompanyById(companyId);
    const automation = automationDailyProd(gameConfig.upgradesConfig, c.activeUpgradeLevels.automatedEngine);
    let workerOut = 0;
    try {
      const workers = await client.getWorkers(companyId);
      workerOut = await companyWorkerOutput(client, workers, LABOR_CONSTANTS);
    } catch {
      // sin acceso a trabajadores: se modela solo la automatización
    }
    const modeled = automation + workerOut;
    if (modeled <= 0) continue;
    modeledByItem.set(c.itemCode, (modeledByItem.get(c.itemCode) ?? 0) + modeled);
  }

  const rows: CalibrationRow[] = [];
  let totalModeled = 0;
  let totalRealized = 0;
  let samples = 0;

  for (const [itemCode, modeledPerDay] of modeledByItem) {
    const realized = await realizedSalesPerDay(client, opts.userId, itemCode, opts.days, now);
    const realizedPerDay = realized ?? 0;
    rows.push({ itemCode, modeledPerDay, realizedPerDay });
    if (realized !== null) {
      totalModeled += modeledPerDay;
      totalRealized += realizedPerDay;
      samples++;
    }
  }

  if (samples === 0 || totalModeled <= 0 || totalRealized <= 0) {
    return { ok: false, reason: "insufficient", rows };
  }

  const factor = totalRealized / totalModeled;
  store.set({ factor, samples, updatedAt: now });
  return { ok: true, factor, samples, rows };
}
