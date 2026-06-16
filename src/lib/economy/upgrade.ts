export interface UpgradeRoiResult {
  paybackDays: number;
  worthIt: boolean;
}

/**
 * ROI de una mejora: días para recuperar el costo con la ganancia extra diaria.
 * @param maxPaybackDays umbral para considerar la mejora rentable (default 30 días).
 */
export function upgradeRoi(args: {
  upgradeCost: number;
  profitDeltaPerDay: number;
  maxPaybackDays?: number;
}): UpgradeRoiResult {
  const threshold = args.maxPaybackDays ?? 30;
  if (args.profitDeltaPerDay <= 0) {
    return { paybackDays: Infinity, worthIt: false };
  }
  const paybackDays = args.upgradeCost / args.profitDeltaPerDay;
  return { paybackDays, worthIt: paybackDays <= threshold };
}
