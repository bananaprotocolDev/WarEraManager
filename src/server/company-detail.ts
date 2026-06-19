import type { WareraClient } from "@/lib/warera/client";
import {
  toItemDef,
  maxWorkers,
  LABOR_CONSTANTS,
  summarizeLaborMarket,
  hiringRecommendation,
  type HiringRecommendation,
} from "@/lib/economy";
import { assembleCompanyReport, type CompanyReport } from "./company-report";
import { realizedSalesPerDay } from "./sell-rate";
import { companyWorkerOutput, type WorkerLite } from "./worker-output";
import { priceTrendFor } from "./price-trend-for";
import type { PriceHistoryStore } from "@/lib/db/price-store";

export interface RecipeEntry {
  input: string;
  qtyPerUnit: number;
}

export interface CompanyDetail {
  id: string;
  itemCode: string;
  report: CompanyReport;
  workers: WorkerLite[];
  wagesAvailable: boolean;
  upgrades: { automatedEngine: number; breakRoom: number; storage: number };
  recipe: RecipeEntry[];
  estimated: boolean;
  hiring: HiringRecommendation;
  sellPerDay: number | null;
}

export interface BuildCompanyDetailOptions {
  companyId: string;
  userId: string;
  authenticated: boolean;
  /** Factor de corrección de tasa (calibración). Las rutas lo inyectan; default 1. */
  rateFactor?: number;
  priceStore?: PriceHistoryStore;
}

/** Detalle completo de una empresa: desglose, trabajadores, upgrades y receta. */
export async function buildCompanyDetail(
  client: WareraClient,
  opts: BuildCompanyDetailOptions,
): Promise<CompanyDetail> {
  const [prices, gameConfig, user, c] = await Promise.all([
    client.getPrices(),
    client.getGameConfig(),
    client.getUserLite(opts.userId),
    client.getCompanyById(opts.companyId),
  ]);

  const country = user.country
    ? await client.getCountryById(user.country)
    : { taxes: { income: 0, market: 0, selfWork: 0 }, productionBonus: 0 };
  const taxes = country.taxes;
  const productionBonus = country.productionBonus;

  let workers: WorkerLite[] = [];
  let wagesAvailable = opts.authenticated;
  if (opts.authenticated) {
    try {
      workers = await client.getWorkers(opts.companyId);
    } catch {
      wagesAvailable = false;
    }
  }

  const workerDailyOutput = opts.authenticated
    ? await companyWorkerOutput(client, workers, LABOR_CONSTANTS)
    : 0;

  const rawItem = gameConfig.items[c.itemCode] ?? { type: "product", productionPoints: 1, productionNeeds: {} };
  const item = toItemDef(c.itemCode, rawItem);

  const company = {
    id: c._id,
    itemCode: c.itemCode,
    production: c.production,
    workerCount: c.workerCount,
    upgrades: c.activeUpgradeLevels,
    name: c.name ?? "",
    isFull: c.isFull ?? false,
    estimatedValue: c.estimatedValue ?? 0,
  };

  const measuredRate = opts.authenticated
    ? (await realizedSalesPerDay(client, opts.userId, c.itemCode, 7)) ?? undefined
    : undefined;

  const priceInfo = await priceTrendFor(opts.priceStore, c.itemCode, prices);

  // Recalcular el report con measuredRate si lo conocemos (afecta usefulRate).
  const reportWithSell = assembleCompanyReport({
    company, item, workers, prices, taxes,
    upgradesConfig: gameConfig.upgradesConfig,
    measuredRate,
    productionBonus,
    workerDailyOutput,
    rateFactor: opts.rateFactor,
    priceInfo,
  });

  const offers = await client.getWorkOffers({ limit: 20 }).then((r) => r.items).catch(() => []);
  const market = summarizeLaborMarket(offers);
  const slots = maxWorkers(gameConfig.upgradesConfig, c.activeUpgradeLevels.breakRoom);
  const hiring = hiringRecommendation({
    marginPerUnit: reportWithSell.marginPerUnit,
    maxWagePerPoint: reportWithSell.maxWageToHire,
    currentDailyRate: reportWithSell.dailyProductionRate,
    freeSlots: Math.max(0, slots - c.workerCount),
    sellPerDay: measuredRate,
    market,
    laborConstants: LABOR_CONSTANTS,
  });

  const recipe: RecipeEntry[] = Object.entries(item.productionNeeds).map(([input, qtyPerUnit]) => ({
    input,
    qtyPerUnit,
  }));

  return {
    id: c._id,
    itemCode: c.itemCode,
    report: reportWithSell,
    workers,
    wagesAvailable,
    upgrades: c.activeUpgradeLevels, // now { automatedEngine, breakRoom, storage }
    recipe,
    estimated: reportWithSell.profit.estimated,
    hiring,
    sellPerDay: measuredRate ?? null,
  };
}
