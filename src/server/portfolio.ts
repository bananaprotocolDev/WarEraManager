import type { WareraClient } from "@/lib/warera/client";
import { toItemDef } from "@/lib/economy";
import { assembleCompanyReport, type CompanyReport } from "./company-report";

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

  // Sin autenticación, worker.getWorkers devuelve 401 → ni lo intentamos
  // (evita un round-trip garantizado a 401). Con auth, sí lo leemos.
  let wagesAvailable = opts.authenticated;
  const companies: CompanyReport[] = [];

  for (const companyId of companyList.items) {
    const c = await client.getCompanyById(companyId);

    let workers: { wage: number }[] = [];
    if (opts.authenticated) {
      try {
        workers = await client.getWorkers(companyId);
      } catch {
        wagesAvailable = false;
      }
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

    const report = assembleCompanyReport({ company, item, workers, prices, taxes });
    companies.push(report);
  }

  const totalNetProfit = companies.reduce((s, c) => s + c.profit.netProfit, 0);
  const estimated = companies.some((c) => c.profit.estimated);

  return { userId: opts.userId, companies, totalNetProfit, wagesAvailable, estimated };
}
