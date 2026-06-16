import type { ItemDef, CompanyData, WorkerData, Taxes, PriceMap } from "./types";
import { GameConstants, GAME_CONSTANTS, unitsPerDay } from "../game-constants";

export interface ProfitBreakdown {
  unitsPerDay: number;
  revenue: number;
  inputCost: number;
  wageCost: number;
  tax: number;
  netProfit: number;
  /** true si las constantes del juego no están calibradas (cifra estimada). */
  estimated: boolean;
}

export function companyProfit(args: {
  company: CompanyData;
  item: ItemDef;
  workers: WorkerData[];
  prices: PriceMap;
  taxes: Taxes;
  constants?: GameConstants;
}): ProfitBreakdown {
  const constants = args.constants ?? GAME_CONSTANTS;
  const units = unitsPerDay(args.company.production, constants);

  const price = args.prices[args.item.code] ?? 0;
  const revenue = units * price;

  let inputCost = 0;
  for (const [inputCode, qtyPerUnit] of Object.entries(args.item.productionNeeds)) {
    const inputPrice = args.prices[inputCode] ?? 0;
    inputCost += qtyPerUnit * units * inputPrice;
  }

  const wageCost = args.workers.reduce((sum, w) => sum + w.wage, 0);
  const tax = revenue * ((args.taxes.market ?? 0) / 100);
  const netProfit = revenue - inputCost - wageCost - tax;

  return {
    unitsPerDay: units,
    revenue,
    inputCost,
    wageCost,
    tax,
    netProfit,
    estimated: !constants.calibrated,
  };
}
