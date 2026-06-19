import { companyProfit, maxWagePerPoint, maxWagePerPointFromValue, automationDailyProd, storageMax } from "@/lib/economy";
import type { ItemDef, WorkerData, Taxes, PriceMap, ProfitBreakdown, ItemValue } from "@/lib/economy";
import type { UpgradesConfig } from "@/lib/economy";
import type { PriceTrendInfo } from "@/lib/economy";

export interface ReportCompany {
  id: string;
  itemCode: string;
  production: number; // stock actual
  workerCount: number;
  upgrades: { automatedEngine: number; breakRoom: number; storage: number };
  name: string;
  isFull: boolean;
  estimatedValue: number;
}

export interface CompanyReport {
  id: string;
  itemCode: string;
  profit: ProfitBreakdown;
  /** Salario máximo por punto (margen neto de impuesto). */
  maxWageToHire: number;
  marginPerUnit: number;
  /** Mejor destino del ítem si se calculó (vender vs procesar). */
  destination?: "sell" | "process";
  /** Stock actual en almacén. */
  stock: number;
  /** Tope del almacén. */
  storageMax: number;
  /** Tasa de producción diaria (automatización en 7A; + trabajadores en 7B). */
  dailyProductionRate: number;
  /** Tasa potencial del modelo: (auto + workers) × (1 + productionBonus) × rateFactor. */
  potentialRate: number;
  /** true si dailyProductionRate proviene de ventas reales medidas. */
  measured: boolean;
  price?: PriceTrendInfo;
  name: string;
  rarity: string;
  isFull: boolean;
  estimatedValue: number;
}

/** Reporte económico de UNA empresa con el modelo de tasa diaria (puro). */
export function assembleCompanyReport(args: {
  company: ReportCompany;
  item: ItemDef;
  workers: WorkerData[];
  prices: PriceMap;
  taxes: Taxes;
  upgradesConfig: UpgradesConfig;
  /** Tasa real medida (ventas reales/día). Reemplaza a sellPerDay. Si falta, se usa el modelo. */
  measuredRate?: number;
  /** Bonus de producción del país (decimal, ej. 0.2 = +20%). Default 0. */
  productionBonus?: number;
  /** Aporte de trabajadores en unidades/día (7C). Default 0. */
  workerDailyOutput?: number;
  /** Factor de corrección de tasa (calibración). Default 1. */
  rateFactor?: number;
  priceInfo?: PriceTrendInfo;
  itemValue?: ItemValue;
}): CompanyReport {
  const automation = automationDailyProd(args.upgradesConfig, args.company.upgrades.automatedEngine);
  const potentialRate =
    (automation + (args.workerDailyOutput ?? 0)) * (1 + (args.productionBonus ?? 0)) * (args.rateFactor ?? 1);
  const dailyProductionRate = args.measuredRate ?? potentialRate;
  const measured = args.measuredRate != null;
  const wageCostPerDay = args.workers.reduce((sum, w) => sum + w.wage, 0);

  const profit = companyProfit({
    dailyProductionRate,
    sellPerDay: args.measuredRate, // si hay real, fija usefulRate y estimated=false
    item: args.item,
    prices: args.prices,
    taxes: args.taxes,
    wageCostPerDay,
  });

  let marginPerUnit: number;
  let maxWageToHire: number;
  let destination: "sell" | "process" | undefined;
  if (args.itemValue) {
    let inputCostPerUnit = 0;
    for (const [code, qty] of Object.entries(args.item.productionNeeds)) {
      inputCostPerUnit += qty * (args.prices[code] ?? 0);
    }
    marginPerUnit = args.itemValue.unitValue - inputCostPerUnit;
    maxWageToHire = maxWagePerPointFromValue(args.itemValue.unitValue, inputCostPerUnit, args.item.productionPoints);
    destination = args.itemValue.destination;
  } else {
    const mw = maxWagePerPoint(args.item, args.prices, args.taxes);
    marginPerUnit = mw.marginPerUnit;
    maxWageToHire = mw.maxWage;
  }

  return {
    id: args.company.id,
    itemCode: args.company.itemCode,
    profit,
    maxWageToHire,
    marginPerUnit,
    destination,
    stock: args.company.production,
    storageMax: storageMax(args.upgradesConfig, args.company.upgrades.storage),
    dailyProductionRate,
    potentialRate,
    measured,
    price: args.priceInfo,
    name: args.company.name,
    rarity: args.item.rarity ?? "common",
    isFull: args.company.isFull,
    estimatedValue: args.company.estimatedValue,
  };
}
