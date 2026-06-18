import type { Calibration } from "@/lib/db/calibration-store";
import { getCalibrationStore } from "@/lib/db/get-calibration-store";

/** Factor de corrección de tasa a partir de una calibración (1 = sin corrección). */
export function rateFactorFrom(c: Calibration | null): number {
  return c && c.factor > 0 ? c.factor : 1;
}

/**
 * Carga el factor de tasa vigente desde el store (server).
 * No-fatal: si la DB falla (cold start / hipo de Neon), devuelve 1 (sin corrección)
 * en vez de romper el reporte. La calibración es un enriquecimiento, no un requisito.
 */
export async function getRateFactor(): Promise<number> {
  try {
    return rateFactorFrom(await getCalibrationStore().get());
  } catch {
    return 1;
  }
}
