import type { WareraClient } from "@/lib/warera/client";
import { toItemDef } from "@/lib/economy";
import { assembleCompanyReport, type CompanyReport } from "./company-report";
import { realizedSalesPerDay } from "./sell-rate";
import { priceTrendFor } from "./price-trend-for";
import type { PriceHistoryStore } from "@/lib/db/price-store";

export type { CompanyReport };

export interface Portfolio {
  userId: string;
  companies: CompanyReport[];
  totalNetProfit: number;
  /** true si se pudieron leer los salarios (requiere auth). */
  wagesAvailable: boolean;
  /** true si las cifras son estimadas (game-constants sin calibrar). */
  estimated: boolean;
}

export interface BuildPortfolioOptions {
  userId: string;
  /** Si el request traía API token (afecta el flag wagesAvailable por defecto). */
  authenticated: boolean;
  /** Factor de corrección de tasa (calibración). Las rutas lo inyectan; default 1. */
  rateFactor?: number;
  priceStore?: PriceHistoryStore;
}

/**
 * Construye el reporte de cartera de un usuario: por cada empresa calcula
 * beneficio/día y análisis de contratación, usando precios + recetas globales.
 */
export async function buildPortfolio(
  client: WareraClient,
  opts: BuildPortfolioOptions,
): Promise<Portfolio> {
  const [prices, gameConfig, user, companyList] = await Promise.all([
    client.getPrices(),
    client.getGameConfig(),
    client.getUserLite(opts.userId),
    client.getUserCompanies(opts.userId),
  ]);

  const country = user.country
    ? await client.getCountryById(user.country)
    : { taxes: { income: 0, market: 0, selfWork: 0 }, productionBonus: 0 };
  const taxes = country.taxes;
  const productionBonus = country.productionBonus;

  const results = await Promise.all(
    companyList.items.map(async (companyId) => {
      const c = await client.getCompanyById(companyId);
      let workers: { wage: number }[] = [];
      let workersOk = opts.authenticated;
      if (opts.authenticated) {
        try {
          workers = await client.getWorkers(companyId);
        } catch {
          workersOk = false;
        }
      }
      const rawItem = gameConfig.items[c.itemCode] ?? { type: "product", productionPoints: 1, productionNeeds: {} };
      const item = toItemDef(c.itemCode, rawItem);
      const company = {
        id: c._id, itemCode: c.itemCode, production: c.production, workerCount: c.workerCount,
        upgrades: c.activeUpgradeLevels, name: c.name ?? "", isFull: c.isFull ?? false, estimatedValue: c.estimatedValue ?? 0,
      };
      const measuredRate = opts.authenticated
        ? (await realizedSalesPerDay(client, opts.userId, c.itemCode, 7)) ?? undefined
        : undefined;
      const priceInfo = await priceTrendFor(opts.priceStore, c.itemCode, prices);
      const report = assembleCompanyReport({
        company, item, workers, prices, taxes,
        upgradesConfig: gameConfig.upgradesConfig,
        rateFactor: opts.rateFactor, productionBonus, measuredRate, priceInfo,
      });
      return { report, workersOk };
    }),
  );

  const companies = results.map((r) => r.report);
  const wagesAvailable = opts.authenticated && results.every((r) => r.workersOk);
  const totalNetProfit = companies.reduce((s, c) => s + c.profit.netProfit, 0);
  const estimated = companies.some((c) => c.profit.estimated);

  return { userId: opts.userId, companies, totalNetProfit, wagesAvailable, estimated };
}
