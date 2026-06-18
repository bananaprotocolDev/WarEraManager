import type { ItemDef, PriceMap, Taxes } from "./types";

export interface MaxWageResult {
  /** Margen bruto por unidad: precio - costo de insumos por unidad. */
  marginPerUnit: number;
  /** Salario máximo por punto de producción = margen neto de impuesto de mercado. */
  maxWage: number;
}

/** Salario máximo a pagar por punto de producción para que la empresa siga rentable. */
export function maxWagePerPoint(item: ItemDef, prices: PriceMap, taxes: Taxes): MaxWageResult {
  const price = prices[item.code] ?? 0;
  let inputCostPerUnit = 0;
  for (const [inputCode, qty] of Object.entries(item.productionNeeds)) {
    inputCostPerUnit += qty * (prices[inputCode] ?? 0);
  }
  const marginPerUnit = price - inputCostPerUnit;
  const maxWage = marginPerUnit * (1 - (taxes.market ?? 0) / 100);
  return { marginPerUnit, maxWage };
}
