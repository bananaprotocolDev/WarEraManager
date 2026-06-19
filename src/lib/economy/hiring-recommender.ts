import { workerUnitsPerDay, levelForProductionValue, type LaborConstants } from "./labor";
import type { LaborMarketSummary } from "./labor-market";

export type HiringReason = "item_unprofitable" | "no_slots" | "no_demand" | "market_expensive" | "ok";

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
  /** true si hay datos de salario de mercado (medianWage no nulo); si false, netPerWorkerPerDay no es confiable. */
  marketDataAvailable: boolean;
  recommendedProfile: RecommendedProfile;
  /** Ganancia neta extra esperada por día si contratás el perfil sugerido. */
  expectedDailyGain: number;
  /** Valor que aporta un trabajador del perfil sugerido por día. */
  addsPerDay: number;
  /** Costo/día de ese trabajador al salario de mercado. */
  marketWagePerDay: number;
  /** Neto/día del trabajador = aporta − costo de mercado (número principal de la UI). */
  netPerWorkerPerDay: number;
}

const EMPTY_PROFILE: RecommendedProfile = { minProduction: 0, minEnergy: 0, minLevel: 0 };

export function hiringRecommendation(args: {
  marginPerUnit: number;
  /** Valor marginal real de una unidad (mejor destino). */
  unitValue: number;
  /** Costo de insumos comprados por unidad. */
  inputCostPerUnit: number;
  /** Puntos de producción por unidad del ítem. */
  prodPoints: number;
  maxWagePerPoint: number;
  /** Tasa de producción diaria actual (automatización + trabajadores). */
  currentDailyRate: number;
  freeSlots: number;
  sellPerDay?: number;
  market: LaborMarketSummary;
  laborConstants: LaborConstants;
}): HiringRecommendation {
  const demandKnown = args.sellPerDay !== undefined;
  const marketDataAvailable = args.market.medianWage != null;

  // Perfil sugerido a partir del mercado.
  const minEnergy = args.market.medianMinEnergy ?? 50;
  const minProduction = args.market.medianMinProduction ?? 50;
  const minLevel = levelForProductionValue(minProduction);
  const profile: RecommendedProfile = { minProduction, minEnergy, minLevel };

  // Economía de un trabajador del perfil.
  const perWorkerUnits = workerUnitsPerDay(minProduction, minEnergy, 0, args.laborConstants);
  const addsPerDay = perWorkerUnits * (args.unitValue - args.inputCostPerUnit);
  const marketWagePerPoint = args.market.medianWage ?? 0;
  const marketWagePerDay = marketWagePerPoint * args.prodPoints * perWorkerUnits;
  const netPerWorkerPerDay = addsPerDay - marketWagePerDay;

  const marketWage = args.market.medianWage ?? args.maxWagePerPoint * 0.85;
  const suggestedWage = Math.max(0, Math.min(args.maxWagePerPoint * 0.95, marketWage));

  const baseOut = {
    maxWagePerPoint: args.maxWagePerPoint,
    suggestedWage: 0,
    freeSlots: args.freeSlots,
    demandKnown,
    marketDataAvailable,
    recommendedProfile: EMPTY_PROFILE,
    expectedDailyGain: 0,
    addsPerDay,
    marketWagePerDay,
    netPerWorkerPerDay,
  };

  if (args.marginPerUnit <= 0) return { ...baseOut, viable: false, reason: "item_unprofitable" };
  if (args.freeSlots <= 0) return { ...baseOut, viable: false, reason: "no_slots" };

  const headroom = demandKnown ? (args.sellPerDay as number) - args.currentDailyRate : Infinity;
  if (demandKnown && headroom <= 0) return { ...baseOut, viable: false, reason: "no_demand" };

  if (netPerWorkerPerDay <= 0) {
    return { ...baseOut, viable: false, reason: "market_expensive", recommendedProfile: profile };
  }

  // Ganancia esperada/día: unidades que aporta el perfil (limitadas por headroom y slots)
  // por el margen restante tras pagar el salario sugerido.
  const totalWorkerUnits = perWorkerUnits * args.freeSlots;
  const addressable = Number.isFinite(headroom) ? Math.min(totalWorkerUnits, headroom) : totalWorkerUnits;
  const expectedDailyGain = addressable * Math.max(0, args.maxWagePerPoint - suggestedWage) * args.prodPoints;

  return {
    ...baseOut,
    viable: true,
    reason: "ok",
    suggestedWage,
    recommendedProfile: profile,
    expectedDailyGain,
  };
}
