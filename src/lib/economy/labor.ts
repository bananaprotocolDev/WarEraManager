/**
 * Constantes del modelo laboral. La regen de energía no está 100% documentada,
 * por eso `throughputFactor` es calibrable (Plan 7C). El veredicto de contratación
 * y el salario máximo NO dependen de esto; solo el dimensionamiento del perfil/ganancia.
 */
export interface LaborConstants {
  regenDividedBy: number;
  energyCostPerAction: number;
  hoursPerDay: number;
  throughputFactor: number;
  calibrated: boolean;
}

export const LABOR_CONSTANTS: LaborConstants = {
  regenDividedBy: 10,
  energyCostPerAction: 10,
  hoursPerDay: 24,
  throughputFactor: 1,
  calibrated: false,
};

/** Acciones de trabajo por día a partir del valor de energía. */
export function actionsPerDay(energyValue: number, c: LaborConstants = LABOR_CONSTANTS): number {
  return (energyValue * c.hoursPerDay) / (c.regenDividedBy * c.energyCostPerAction);
}

/** Unidades que produce por día un trabajador con cierta producción, energía y fidelidad. */
export function workerUnitsPerDay(
  productionValue: number,
  energyValue: number,
  fidelity: number,
  c: LaborConstants = LABOR_CONSTANTS,
): number {
  return actionsPerDay(energyValue, c) * productionValue * (1 + fidelity / 100) * c.throughputFactor;
}

/** Valor del skill de producción para un nivel (10 base, +3 por nivel). */
export function productionValueForLevel(level: number): number {
  return 10 + 3 * level;
}

/** Nivel mínimo de skill de producción para alcanzar un valor (redondea hacia arriba). */
export function levelForProductionValue(value: number): number {
  return Math.max(0, Math.ceil((value - 10) / 3));
}

/** Valor del skill de energía para un nivel (30 base, +10 por nivel). */
export function energyValueForLevel(level: number): number {
  return 30 + 10 * level;
}
