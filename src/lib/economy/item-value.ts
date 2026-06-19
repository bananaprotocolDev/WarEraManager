import type { ItemDef, PriceMap, Taxes } from "./types";

export type Destination = "sell" | "process";

export interface ItemValue {
  /** Valor marginal real de una unidad = mejor destino. */
  unitValue: number;
  destination: Destination;
  /** Venta neta = precio × (1 − impMercado). */
  sellNet: number;
  /** Valor procesándolo en el producto downstream propio; null si no aplica. */
  processValue: number | null;
}

/**
 * Valor marginal real de una unidad del ítem: max(venderlo neto, procesarlo).
 * `downstream` es el producto propio que consume este ítem (si existe). `marketWagePerPoint`
 * costea la mano de obra de procesar el downstream (default 0).
 * `processValue` se expresa por unidad de ESTE ítem consumida por el downstream:
 * (ventaNeta(q) − otrosInsumos − labor) / n, donde n es la cantidad requerida por unidad de q.
 */
export function bestDestinationValue(args: {
  item: ItemDef;
  prices: PriceMap;
  taxes: Taxes;
  downstream?: { item: ItemDef } | null;
  marketWagePerPoint?: number;
}): ItemValue {
  const market = (args.taxes.market ?? 0) / 100;
  const price = args.prices[args.item.code] ?? 0;
  const sellNet = price * (1 - market);

  let processValue: number | null = null;
  if (args.downstream) {
    const q = args.downstream.item;
    const n = q.productionNeeds[args.item.code] ?? 0;
    if (n > 0) {
      const qSellNet = (args.prices[q.code] ?? 0) * (1 - market);
      let otherInputs = 0;
      for (const [code, qty] of Object.entries(q.productionNeeds)) {
        if (code === args.item.code) continue;
        otherInputs += qty * (args.prices[code] ?? 0);
      }
      const processLabor = (args.marketWagePerPoint ?? 0) * q.productionPoints;
      processValue = (qSellNet - otherInputs - processLabor) / n;
    }
  }

  const useProcess = processValue != null && processValue > sellNet;
  return {
    unitValue: useProcess && processValue != null ? processValue : sellNet,
    destination: useProcess ? "process" : "sell",
    sellNet,
    processValue,
  };
}

/** Costo de insumos comprados por unidad: Σ cantidad × precio sobre productionNeeds. */
export function inputCostPerUnit(item: ItemDef, prices: PriceMap): number {
  let total = 0;
  for (const [code, qty] of Object.entries(item.productionNeeds)) {
    total += qty * (prices[code] ?? 0);
  }
  return total;
}

/** Salario máximo pagable por punto de producción dado el valor del ítem. */
export function maxWagePerPointFromValue(
  unitValue: number,
  inputCostPerUnit: number,
  prodPoints: number,
): number {
  return prodPoints > 0 ? (unitValue - inputCostPerUnit) / prodPoints : 0;
}
