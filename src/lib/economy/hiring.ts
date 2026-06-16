import type { ItemDef, CompanyData, Taxes, PriceMap } from "./types";
import { GameConstants, GAME_CONSTANTS, perWorkerUnitsPerDay } from "../game-constants";

export interface HiringResult {
  marginalUnitsPerDay: number;
  /** Valor neto/día que aporta un trabajador extra (ingresos extra - inputs extra - impuesto extra). */
  marginalValue: number;
  /** Salario máximo a pagar para que siga conviniendo. */
  maxWage: number;
  worthIt: boolean;
  estimated: boolean;
}

export function hiringAnalysis(args: {
  company: CompanyData;
  item: ItemDef;
  prices: PriceMap;
  taxes: Taxes;
  candidateWage: number;
  constants?: GameConstants;
}): HiringResult {
  const constants = args.constants ?? GAME_CONSTANTS;
  const marginalUnits = perWorkerUnitsPerDay(args.company.production, args.company.workerCount, constants);

  const price = args.prices[args.item.code] ?? 0;
  const marginalRevenue = marginalUnits * price;

  let marginalInputCost = 0;
  for (const [inputCode, qtyPerUnit] of Object.entries(args.item.productionNeeds)) {
    marginalInputCost += qtyPerUnit * marginalUnits * (args.prices[inputCode] ?? 0);
  }

  const marginalTax = marginalRevenue * ((args.taxes.market ?? 0) / 100);
  const marginalValue = marginalRevenue - marginalInputCost - marginalTax;

  return {
    marginalUnitsPerDay: marginalUnits,
    marginalValue,
    maxWage: marginalValue,
    worthIt: args.candidateWage < marginalValue,
    estimated: !constants.calibrated,
  };
}
