import type { ItemDef, PriceMap, Taxes } from "./types";

export interface ProfitBreakdown {
  /** Producción diaria total (automatización + trabajadores). */
  dailyProductionRate: number;
  /** Tasa efectiva vendible: min(tasa, venta/día). */
  usefulRate: number;
  revenue: number;
  inputCost: number;
  wageCost: number;
  tax: number;
  netProfit: number;
  /** true si no se proveyó venta/día y se asumió vender todo lo producido. */
  sellAssumed: boolean;
  /** true si alguna parte de la cifra es un supuesto (hoy: venta asumida). */
  estimated: boolean;
}

export function companyProfit(args: {
  dailyProductionRate: number;
  sellPerDay?: number;
  item: ItemDef;
  prices: PriceMap;
  taxes: Taxes;
  wageCostPerDay?: number;
}): ProfitBreakdown {
  const sellAssumed = args.sellPerDay === undefined;
  const usefulRate = sellAssumed ? args.dailyProductionRate : Math.min(args.dailyProductionRate, args.sellPerDay as number);

  const price = args.prices[args.item.code] ?? 0;
  const revenue = usefulRate * price;

  let inputCost = 0;
  for (const [inputCode, qtyPerUnit] of Object.entries(args.item.productionNeeds)) {
    inputCost += qtyPerUnit * usefulRate * (args.prices[inputCode] ?? 0);
  }

  const wageCost = args.wageCostPerDay ?? 0;
  const tax = revenue * ((args.taxes.market ?? 0) / 100);
  const netProfit = revenue - inputCost - wageCost - tax;

  return {
    dailyProductionRate: args.dailyProductionRate,
    usefulRate,
    revenue,
    inputCost,
    wageCost,
    tax,
    netProfit,
    sellAssumed,
    estimated: sellAssumed,
  };
}
