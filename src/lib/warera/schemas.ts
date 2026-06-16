import { z } from "zod";

/** Envoltorio tRPC: la data útil vive en result.data. */
export function trpcEnvelope<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({ result: z.object({ data: dataSchema }) }).transform((v) => v.result.data);
}

/** itemTrading.getPrices -> { itemCode: precio }. */
export const pricesSchema = z.record(z.string(), z.number());

/** company.getById. Tolerante a campos extra; normaliza upgrades. */
export const companySchema = z
  .object({
    _id: z.string(),
    itemCode: z.string(),
    production: z.number().default(0),
    workerCount: z.number().default(0),
    activeUpgradeLevels: z
      .object({
        automatedEngine: z.number().default(0),
        breakRoom: z.number().default(0),
      })
      .partial()
      .transform((u) => ({
        automatedEngine: u.automatedEngine ?? 0,
        breakRoom: u.breakRoom ?? 0,
      }))
      .default({}),
  })
  .passthrough();

/** company.getCompanies -> lista paginada de ids. */
export const companyListSchema = z.object({
  items: z.array(z.string()),
  nextCursor: z.string().nullable().optional(),
});

/** worker.getWorkers -> lista de trabajadores con salario. */
export const workersSchema = z.array(z.object({ wage: z.number() }).passthrough());

/** country.getCountryById -> impuestos. */
export const countrySchema = z
  .object({
    taxes: z
      .object({
        income: z.number().default(0),
        market: z.number().default(0),
        selfWork: z.number().default(0),
      })
      .partial()
      .transform((t) => ({
        income: t.income ?? 0,
        market: t.market ?? 0,
        selfWork: t.selfWork ?? 0,
      }))
      .default({}),
  })
  .passthrough();
