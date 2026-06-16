import { z } from "zod";
import {
  trpcEnvelope,
  pricesSchema,
  companySchema,
  companyListSchema,
  workersSchema,
  countrySchema,
} from "./schemas";

const DEFAULT_BASE = "https://api2.warera.io/trpc";
const ORIGIN = "https://app.warera.io";

export class WareraClient {
  constructor(private baseUrl: string = DEFAULT_BASE) {}

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
    const res = await fetch(url, {
      headers: { Origin: ORIGIN, "User-Agent": "Mozilla/5.0" },
    });
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
}
