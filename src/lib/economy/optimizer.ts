import type { ItemDef, PriceMap } from "./types";

export interface ProductionOption {
  itemCode: string;
  /** Margen neto por punto de producción: (precio - costo insumos por unidad) / productionPoints. */
  marginPerPoint: number;
}

export function productionOptimizer(args: { items: ItemDef[]; prices: PriceMap }): ProductionOption[] {
  const options: ProductionOption[] = [];

  for (const item of args.items) {
    if (item.type !== "product" && item.type !== "raw") continue;
    const sellPrice = args.prices[item.code];
    if (sellPrice === undefined) continue;

    let inputCostPerUnit = 0;
    for (const [inputCode, qty] of Object.entries(item.productionNeeds)) {
      inputCostPerUnit += qty * (args.prices[inputCode] ?? 0);
    }

    const points = item.productionPoints > 0 ? item.productionPoints : 1;
    options.push({ itemCode: item.code, marginPerPoint: (sellPrice - inputCostPerUnit) / points });
  }

  return options.sort((a, b) => b.marginPerPoint - a.marginPerPoint);
}
