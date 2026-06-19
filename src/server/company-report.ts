import { companyProfit, maxWagePerPoint, automationDailyProd, storageMax } from "@/lib/economy";
import type { ItemDef, WorkerData, Taxes, PriceMap, ProfitBreakdown } from "@/lib/economy";
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
  /** Stock actual en almacén. */
  stock: number;
  /** Tope del almacén. */
  storageMax: number;
  /** Tasa de producción diaria (automatización en 7A; + trabajadores en 7B). */
  dailyProductionRate: number;
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
  /** Venta real/día (7B). Si falta, se asume vender todo lo producido. */
  sellPerDay?: number;
  /** Aporte de trabajadores en unidades/día (7C). Default 0. */
  workerDailyOutput?: number;
  /** Factor de corrección de tasa (calibración). Default 1. */
  rateFactor?: number;
  priceInfo?: PriceTrendInfo;
}): CompanyReport {
  const automation = automationDailyProd(args.upgradesConfig, args.company.upgrades.automatedEngine);
  const dailyProductionRate = (automation + (args.workerDailyOutput ?? 0)) * (args.rateFactor ?? 1);
  const wageCostPerDay = args.workers.reduce((sum, w) => sum + w.wage, 0);

  const profit = companyProfit({
    dailyProductionRate,
    sellPerDay: args.sellPerDay,
    item: args.item,
    prices: args.prices,
    taxes: args.taxes,
    wageCostPerDay,
  });

  const mw = maxWagePerPoint(args.item, args.prices, args.taxes);

  return {
    id: args.company.id,
    itemCode: args.company.itemCode,
    profit,
    maxWageToHire: mw.maxWage,
    marginPerUnit: mw.marginPerUnit,
    stock: args.company.production,
    storageMax: storageMax(args.upgradesConfig, args.company.upgrades.storage),
    dailyProductionRate,
    price: args.priceInfo,
    name: args.company.name,
    rarity: args.item.rarity ?? "common",
    isFull: args.company.isFull,
    estimatedValue: args.company.estimatedValue,
  };
}
