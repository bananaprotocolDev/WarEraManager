import type { WareraClient } from "@/lib/warera/client";
import { companyProfit, hiringAnalysis, toItemDef } from "@/lib/economy";
import type { ProfitBreakdown } from "@/lib/economy";
import type { HiringResult } from "@/lib/economy";

export interface CompanyReport {
  id: string;
  itemCode: string;
  profit: ProfitBreakdown;
  hiring: HiringResult;
  /** Atajo: salario máximo a pagar por un trabajador extra. */
  maxWageToHire: number;
}

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

  const taxes = user.country
    ? (await client.getCountryById(user.country)).taxes
    : { income: 0, market: 0, selfWork: 0 };

  let wagesAvailable = true;
  const companies: CompanyReport[] = [];

  for (const companyId of companyList.items) {
    const c = await client.getCompanyById(companyId);

    let workers: { wage: number }[] = [];
    try {
      workers = await client.getWorkers(companyId);
    } catch {
      wagesAvailable = false;
    }

    const rawItem = gameConfig.items[c.itemCode] ?? {
      type: "product",
      productionPoints: 1,
      productionNeeds: {},
    };
    const item = toItemDef(c.itemCode, rawItem);

    const company = {
      id: c._id,
      itemCode: c.itemCode,
      production: c.production,
      workerCount: c.workerCount,
      upgrades: c.activeUpgradeLevels,
    };

    const profit = companyProfit({ company, item, workers, prices, taxes });
    const hiring = hiringAnalysis({ company, item, prices, taxes, candidateWage: 0 });

    companies.push({ id: c._id, itemCode: c.itemCode, profit, hiring, maxWageToHire: hiring.maxWage });
  }

  const totalNetProfit = companies.reduce((s, c) => s + c.profit.netProfit, 0);
  const estimated = companies.some((c) => c.profit.estimated);

  return { userId: opts.userId, companies, totalNetProfit, wagesAvailable, estimated };
}
