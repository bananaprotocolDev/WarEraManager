import { workerUnitsPerDay, levelForProductionValue, type LaborConstants } from "./labor";
import type { LaborMarketSummary } from "./labor-market";

export type HiringReason = "item_unprofitable" | "no_slots" | "no_demand" | "ok";

export interface RecommendedProfile {
  minProduction: number;
  minEnergy: number;
  minLevel: number;
}

export interface HiringRecommendation {
  viable: boolean;
  reason: HiringReason;
  maxWagePerPoint: number;
  suggestedWage: number;
  freeSlots: number;
  /** true si conocemos la venta/día real (token); false = supuesto. */
  demandKnown: boolean;
  recommendedProfile: RecommendedProfile;
  /** Ganancia neta extra esperada por día si contratás el perfil sugerido. */
  expectedDailyGain: number;
}

const EMPTY_PROFILE: RecommendedProfile = { minProduction: 0, minEnergy: 0, minLevel: 0 };

export function hiringRecommendation(args: {
  marginPerUnit: number;
  maxWagePerPoint: number;
  automationDailyProd: number;
  currentDailyRate: number;
  freeSlots: number;
  sellPerDay?: number;
  market: LaborMarketSummary;
  laborConstants: LaborConstants;
}): HiringRecommendation {
  const demandKnown = args.sellPerDay !== undefined;
  const baseOut = {
    maxWagePerPoint: args.maxWagePerPoint,
    suggestedWage: 0,
    freeSlots: args.freeSlots,
    demandKnown,
    recommendedProfile: EMPTY_PROFILE,
    expectedDailyGain: 0,
  };

  if (args.marginPerUnit <= 0) return { ...baseOut, viable: false, reason: "item_unprofitable" };
  if (args.freeSlots <= 0) return { ...baseOut, viable: false, reason: "no_slots" };

  // Espacio de demanda: cuántas unidades/día extra podés vender por encima de lo que ya producís.
  const headroom = demandKnown ? (args.sellPerDay as number) - args.currentDailyRate : Infinity;
  if (demandKnown && headroom <= 0) return { ...baseOut, viable: false, reason: "no_demand" };

  // Perfil sugerido: cubrir el headroom con los slots libres (si se conoce); si no, usar el mercado.
  const energy = args.market.medianMinEnergy ?? 50;
  const targetUnitsPerWorker = Number.isFinite(headroom) ? headroom / args.freeSlots : Infinity;

  let minProduction: number;
  if (Number.isFinite(targetUnitsPerWorker)) {
    // Invertir el modelo laboral para hallar la producción que rinde esas unidades a esa energía.
    const oneUnitAtProd1 = workerUnitsPerDay(1, energy, 0, args.laborConstants); // unidades/día por punto de producción
    const needed = oneUnitAtProd1 > 0 ? targetUnitsPerWorker / oneUnitAtProd1 : 0;
    minProduction = Math.max(args.market.medianMinProduction ?? 0, Math.ceil(needed));
  } else {
    minProduction = args.market.medianMinProduction ?? 50;
  }
  const minEnergy = energy;
  const minLevel = levelForProductionValue(minProduction);

  // Salario sugerido: por debajo del máximo y alineado al mercado.
  const marketWage = args.market.medianWage ?? args.maxWagePerPoint * 0.85;
  const suggestedWage = Math.max(0, Math.min(args.maxWagePerPoint * 0.95, marketWage));

  // Ganancia esperada/día: unidades que aporta el perfil sugerido (limitadas por headroom y slots)
  // por el margen restante después de pagar el salario sugerido.
  const perWorkerUnits = workerUnitsPerDay(minProduction, minEnergy, 0, args.laborConstants);
  const totalWorkerUnits = perWorkerUnits * args.freeSlots;
  const addressable = Number.isFinite(headroom) ? Math.min(totalWorkerUnits, headroom) : totalWorkerUnits;
  const expectedDailyGain = addressable * Math.max(0, args.maxWagePerPoint - suggestedWage);

  return {
    ...baseOut,
    viable: true,
    reason: "ok",
    suggestedWage,
    recommendedProfile: { minProduction, minEnergy, minLevel },
    expectedDailyGain,
  };
}
