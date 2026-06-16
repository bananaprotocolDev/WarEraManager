/**
 * Constantes del juego WarEra que NO están documentadas oficialmente.
 * Aisladas acá para poder calibrarlas contra datos reales (ver spec §4).
 * Mientras `calibrated` sea false, los cálculos deben marcarse como "estimados".
 */
export interface GameConstants {
  /** Factor para convertir el campo `production` de una empresa en unidades/día. */
  productionToUnitsPerDay: number;
  /** Si las constantes fueron validadas contra datos reales del usuario. */
  calibrated: boolean;
}

export const GAME_CONSTANTS: GameConstants = {
  // PLACEHOLDER estimado: 1:1 hasta calibrar contra transacciones reales.
  productionToUnitsPerDay: 1,
  calibrated: false,
};

/** Unidades producidas por día a partir del campo `production` crudo. */
export function unitsPerDay(production: number, c: GameConstants = GAME_CONSTANTS): number {
  return production * c.productionToUnitsPerDay;
}

/**
 * Estimación de unidades/día que aporta un trabajador.
 * Si hay trabajadores, usa el promedio (production/workerCount).
 * Si no hay, asume una unidad base de producción por el factor.
 */
export function perWorkerUnitsPerDay(
  production: number,
  workerCount: number,
  c: GameConstants = GAME_CONSTANTS,
): number {
  if (workerCount > 0) return (production / workerCount) * c.productionToUnitsPerDay;
  return c.productionToUnitsPerDay;
}
