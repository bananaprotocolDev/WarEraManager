import type { ItemDef, PriceMap, Taxes } from "./types";

export interface ChainCompany {
  id: string;
  itemCode: string;
  item: ItemDef;
  /** Tasa de producción diaria (real medida o modelo). */
  dailyProductionRate: number;
  /** Suma de sueldos reales/día de esta empresa (0 si no se conoce). */
  wageCostPerDay: number;
}

export interface Chain {
  /** Del raw al producto final, ej. ["petroleum","oil"]. */
  steps: string[];
  /** Empresas en el orden de `steps`. */
  companies: ChainCompany[];
}

export interface ChainNet {
  steps: string[];
  netPerDay: number;
  bestRawDestination: "sell" | "process";
  /** true si la producción del final proviene de ventas reales medidas. */
  measured: boolean;
}

/**
 * Detecta cadenas de 2 niveles donde el usuario es dueño del insumo y del producto
 * que lo consume. Una entrada por par (raw, producto).
 */
export function detectChains(companies: ChainCompany[]): Chain[] {
  const byItem = new Map<string, ChainCompany>();
  for (const c of companies) byItem.set(c.itemCode, c);
  const chains: Chain[] = [];
  for (const prod of companies) {
    for (const inputCode of Object.keys(prod.item.productionNeeds)) {
      const rawCompany = byItem.get(inputCode);
      if (rawCompany) {
        chains.push({ steps: [inputCode, prod.itemCode], companies: [rawCompany, prod] });
      }
    }
  }
  return chains;
}

/**
 * Neto/día de la cadena: ingreso neto del producto final − sueldos de TODAS las empresas
 * − insumos del final comprados afuera (todos menos el raw que se autoabastece).
 * Simplificación v1: se asume que el raw propio cubre la necesidad del final.
 */
export function chainNetPerDay(args: {
  chain: Chain;
  prices: PriceMap;
  taxes: Taxes;
  measured: boolean;
  rawDestination: "sell" | "process";
}): ChainNet {
  const market = (args.taxes.market ?? 0) / 100;
  const raw = args.chain.companies[0];
  const final = args.chain.companies[args.chain.companies.length - 1];

  const ingreso = final.dailyProductionRate * (args.prices[final.itemCode] ?? 0) * (1 - market);
  const wages = args.chain.companies.reduce((s, c) => s + c.wageCostPerDay, 0);

  let boughtInputs = 0;
  for (const [code, qty] of Object.entries(final.item.productionNeeds)) {
    if (code === raw.itemCode) continue;
    boughtInputs += qty * final.dailyProductionRate * (args.prices[code] ?? 0);
  }

  return {
    steps: args.chain.steps,
    netPerDay: ingreso - wages - boughtInputs,
    bestRawDestination: args.rawDestination,
    measured: args.measured,
  };
}
