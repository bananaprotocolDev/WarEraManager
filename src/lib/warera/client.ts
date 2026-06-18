import { z } from "zod";
import {
  trpcEnvelope,
  pricesSchema,
  companySchema,
  companyListSchema,
  workersSchema,
  countrySchema,
  gameConfigSchema,
  userLiteSchema,
  transactionsPageSchema,
  workOffersPageSchema,
} from "./schemas";

const DEFAULT_BASE = "https://api2.warera.io/trpc";
const ORIGIN = "https://app.warera.io";

export interface WareraClientOptions {
  baseUrl?: string;
  /** API token de WarEra (Settings → API Tokens). Se envía como header X-API-Key. */
  apiKey?: string;
}

export class WareraClient {
  private baseUrl: string;
  private apiKey?: string;

  constructor(opts: WareraClientOptions = {}) {
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE;
    this.apiKey = opts.apiKey;
  }

  /** Llama un procedimiento tRPC por GET y valida la respuesta. */
  private async call<T extends z.ZodTypeAny>(
    proc: string,
    dataSchema: T,
    input?: unknown,
  ): Promise<z.infer<T>> {
    let url = `${this.baseUrl}/${proc}`;
    if (input !== undefined) {
      url += `?input=${encodeURIComponent(JSON.stringify(input))}`;
    }
    const headers: Record<string, string> = {
      Origin: ORIGIN,
      "User-Agent": "Mozilla/5.0",
    };
    if (this.apiKey) headers["X-API-Key"] = this.apiKey;

    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`WarEra API ${proc} failed: HTTP ${res.status}`);
    }
    const json = await res.json();
    return trpcEnvelope(dataSchema).parse(json);
  }

  getPrices() {
    return this.call("itemTrading.getPrices", pricesSchema);
  }

  getCompanyById(companyId: string) {
    return this.call("company.getById", companySchema, { companyId });
  }

  getUserCompanies(userId: string, perPage = 15) {
    return this.call("company.getCompanies", companyListSchema, { userId, perPage });
  }

  getWorkers(companyId: string) {
    return this.call("worker.getWorkers", workersSchema, { companyId });
  }

  getCountryById(countryId: string) {
    return this.call("country.getCountryById", countrySchema, { countryId });
  }

  getGameConfig() {
    return this.call("gameConfig.getGameConfig", gameConfigSchema);
  }

  getUserLite(userId: string) {
    return this.call("user.getUserLite", userLiteSchema, { userId });
  }

  getUserItemTransactions(userId: string, itemCode: string, cursor?: string) {
    return this.call("transaction.getPaginatedTransactions", transactionsPageSchema, {
      userId,
      itemCode,
      limit: 100,
      ...(cursor ? { cursor } : {}),
    });
  }

  getWorkOffers(opts: { regionId?: string; energy?: number; production?: number; limit?: number } = {}) {
    return this.call("workOffer.getWorkOffersPaginated", workOffersPageSchema, {
      ...(opts.regionId ? { regionId: opts.regionId } : {}),
      energy: opts.energy ?? 0,
      production: opts.production ?? 0,
      limit: opts.limit ?? 20,
    });
  }
}
