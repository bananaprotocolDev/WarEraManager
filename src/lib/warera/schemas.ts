import { z } from "zod";

/** Envoltorio tRPC: la data útil vive en result.data. */
export function trpcEnvelope<T extends z.ZodTypeAny>(dataSchema: T) {
  return z
    .object({ result: z.object({ data: dataSchema }) })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .transform((v: any) => v.result.data as z.output<T>);
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
      .default({ automatedEngine: 0, breakRoom: 0 }),
  })
  .passthrough();

/** company.getCompanies -> lista paginada de ids. */
export const companyListSchema = z.object({
  items: z.array(z.string()),
  nextCursor: z.string().nullable().optional(),
});

/** worker.getWorkers -> lista de trabajadores con salario. */
export const workersSchema = z.array(z.object({ wage: z.number() }).passthrough());

/** Un item dentro de gameConfig.items. Tolerante; normaliza campos de producción. */
export const gameItemSchema = z
  .object({
    type: z.string().default("product"),
    productionPoints: z.number().default(1),
    productionNeeds: z.record(z.string(), z.number()).default({}),
  })
  .passthrough();

/** gameConfig.getGameConfig → { items: { code: gameItem } }. */
export const gameConfigSchema = z
  .object({
    items: z
      .preprocess(
        (raw) => {
          if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return {};
          // Drop non-object values (e.g. strings injected by the API as noise)
          return Object.fromEntries(
            Object.entries(raw as Record<string, unknown>).filter(
              ([, v]) => v !== null && typeof v === "object" && !Array.isArray(v),
            ),
          );
        },
        z.record(z.string(), gameItemSchema),
      )
      .default({}),
  })
  .passthrough();

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
      .default({ income: 0, market: 0, selfWork: 0 }),
  })
  .passthrough();
