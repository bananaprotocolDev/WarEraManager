interface UpgradeLevel {
  stats?: Record<string, number>;
}
interface UpgradeDef {
  levels?: Record<string, UpgradeLevel>;
}
export interface UpgradesConfig {
  automatedEngine?: UpgradeDef;
  storage?: UpgradeDef;
  breakRoom?: UpgradeDef;
}

function stat(def: UpgradeDef | undefined, level: number, key: string): number {
  return def?.levels?.[String(level)]?.stats?.[key] ?? 0;
}

/** Producción diaria de la automatización (unidades/día) para un nivel de automatedEngine. */
export function automationDailyProd(uc: UpgradesConfig, level: number): number {
  return stat(uc.automatedEngine, level, "dailyProd");
}

/** Tope de stock del almacén para un nivel de storage. */
export function storageMax(uc: UpgradesConfig, level: number): number {
  return stat(uc.storage, level, "maxProduction");
}

/** Máximo de trabajadores para un nivel de breakRoom. */
export function maxWorkers(uc: UpgradesConfig, level: number): number {
  return stat(uc.breakRoom, level, "maxWorkers");
}
