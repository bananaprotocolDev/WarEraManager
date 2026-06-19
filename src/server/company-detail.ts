import type { WareraClient } from "@/lib/warera/client";
import {
  toItemDef,
  maxWorkers,
  LABOR_CONSTANTS,
  summarizeLaborMarket,
  hiringRecommendation,
  bestDestinationValue,
  inputCostPerUnit,
  detectChains,
  chainNetPerDay,
  type HiringRecommendation,
  type ChainNet,
  type ChainCompany,
  type ItemDef,
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
  /** Veredicto de la cadena a la que pertenece esta empresa (null si no pertenece). */
  chain: ChainNet | null;
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

  // Empresas propias (para destino del raw y detección de cadena).
  const ownedIds = await client.getUserCompanies(opts.userId).then((r) => r.items).catch(() => []);
  const ownedRaw = await Promise.all(
    ownedIds.map((oid) =>
      oid === c._id ? Promise.resolve(c) : client.getCompanyById(oid).catch(() => null),
    ),
  );
  const owned = ownedRaw.filter((x): x is NonNullable<typeof x> => x != null);
  const ownedItem = (code: string): ItemDef =>
    toItemDef(code, gameConfig.items[code] ?? { type: "product", productionPoints: 1, productionNeeds: {} });

  // Mercado laboral (también costea la mano de obra de procesar para el destino).
  const offers = await client.getWorkOffers({ limit: 20 }).then((r) => r.items).catch(() => []);
  const market = summarizeLaborMarket(offers);

  // Downstream propio que consume este ítem (si existe).
  const downstreamCompany = owned.find(
    (o) => ownedItem(o.itemCode).productionNeeds[c.itemCode] != null,
  );
  const itemValue = bestDestinationValue({
    item, prices, taxes,
    downstream: downstreamCompany ? { item: ownedItem(downstreamCompany.itemCode) } : null,
    marketWagePerPoint: market.medianWage ?? 0,
  });

  // Recalcular el report con measuredRate si lo conocemos (afecta usefulRate).
  const reportWithSell = assembleCompanyReport({
    company, item, workers, prices, taxes,
    upgradesConfig: gameConfig.upgradesConfig,
    measuredRate,
    productionBonus,
    workerDailyOutput,
    rateFactor: opts.rateFactor,
    priceInfo,
    itemValue,
  });

  const slots = maxWorkers(gameConfig.upgradesConfig, c.activeUpgradeLevels.breakRoom);
  const hiring = hiringRecommendation({
    marginPerUnit: reportWithSell.marginPerUnit,
    unitValue: itemValue.unitValue,
    inputCostPerUnit: inputCostPerUnit(item, prices),
    prodPoints: item.productionPoints,
    maxWagePerPoint: reportWithSell.maxWageToHire,
    currentDailyRate: reportWithSell.dailyProductionRate,
    freeSlots: Math.max(0, slots - c.workerCount),
    sellPerDay: measuredRate,
    market,
    laborConstants: LABOR_CONSTANTS,
  });

  const chainCompanies: ChainCompany[] = owned.map((o) => ({
    id: o._id,
    itemCode: o.itemCode,
    item: ownedItem(o.itemCode),
    dailyProductionRate: o._id === c._id ? reportWithSell.dailyProductionRate : (o.production ?? 0),
    wageCostPerDay: 0,
  }));
  const myChain = detectChains(chainCompanies).find((ch) => ch.steps.includes(c.itemCode)) ?? null;
  const chain: ChainNet | null = myChain
    ? chainNetPerDay({
        chain: myChain, prices, taxes,
        measured: reportWithSell.measured,
        rawDestination: itemValue.destination,
      })
    : null;

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
    chain,
  };
}
