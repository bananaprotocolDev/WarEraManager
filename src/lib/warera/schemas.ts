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
        storage: z.number().default(0),
      })
      .partial()
      .transform((u) => ({
        automatedEngine: u.automatedEngine ?? 0,
        breakRoom: u.breakRoom ?? 0,
        storage: u.storage ?? 0,
      }))
      .default({ automatedEngine: 0, breakRoom: 0, storage: 0 }),
  })
  .passthrough();

/** company.getCompanies -> lista paginada de ids. */
export const companyListSchema = z.object({
  items: z.array(z.string()),
  nextCursor: z.string().nullable().optional(),
});

const workerItemSchema = z
  .object({
    user: z.string().optional(),
    wage: z.number().default(0),
    fidelity: z.number().default(0),
  })
  .passthrough();

/**
 * worker.getWorkers -> lista de trabajadores. La API puede devolver la lista en distintas
 * formas (array plano, `{workers:[...]}`, o `{workersPerCompany:[{workers:[...]}]}`); se
 * extrae la lista de trabajadores donde esté antes de validar, para no romper.
 */
export const workersSchema = z.preprocess((val) => {
  if (Array.isArray(val)) return val;
  if (val && typeof val === "object") {
    const o = val as Record<string, unknown>;
    if (Array.isArray(o.workers)) return o.workers;
    if (Array.isArray(o.workersPerCompany)) {
      return (o.workersPerCompany as Array<{ workers?: unknown }>).flatMap((w) =>
        Array.isArray(w.workers) ? w.workers : [],
      );
    }
  }
  return [];
}, z.array(workerItemSchema));

/** Un item dentro de gameConfig.items. Tolerante; normaliza campos de producción. */
export const gameItemSchema = z
  .object({
    type: z.string().default("product"),
    productionPoints: z.number().default(1),
    productionNeeds: z.record(z.string(), z.number()).default({}),
  })
  .passthrough();

const upgradeLevelSchema = z
  .object({ stats: z.record(z.string(), z.number()).default({}) })
  .passthrough();

const upgradeSchema = z
  .object({ levels: z.record(z.string(), upgradeLevelSchema).default({}) })
  .passthrough();

export const upgradesConfigSchema = z
  .object({
    automatedEngine: upgradeSchema.optional(),
    storage: upgradeSchema.optional(),
    breakRoom: upgradeSchema.optional(),
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
    upgradesConfig: upgradesConfigSchema.default({}),
  })
  .passthrough();

const skillValueSchema = z
  .object({ value: z.number().default(0) })
  .partial()
  .transform((s) => ({ value: s.value ?? 0 }))
  .default({ value: 0 });

/** user.getUserLite → datos básicos del usuario (incluye su country id). */
export const userLiteSchema = z
  .object({
    _id: z.string(),
    username: z.string(),
    country: z.string().optional(),
    skills: z
      .object({ production: skillValueSchema, energy: skillValueSchema })
      .partial()
      .transform((s) => ({
        production: s.production ?? { value: 0 },
        energy: s.energy ?? { value: 0 },
      }))
      .default({ production: { value: 0 }, energy: { value: 0 } }),
  })
  .passthrough();

/** Una transacción (de transaction.getPaginatedTransactions). Tolerante a campos extra. */
export const transactionSchema = z
  .object({
    sellerId: z.string().optional(),
    money: z.number().optional(),
    quantity: z.number().optional(),
    createdAt: z.string().optional(),
  })
  .passthrough();

/** Página de transacciones. */
export const transactionsPageSchema = z.object({
  items: z.array(transactionSchema),
  nextCursor: z.string().nullable().optional(),
});

/** Oferta laboral (de workOffer.getWorkOffersPaginated). */
export const workOfferSchema = z
  .object({
    wage: z.number().optional(),
    minEnergy: z.number().optional(),
    minProduction: z.number().optional(),
    minLevel: z.number().optional(),
    region: z.string().optional(),
  })
  .passthrough();

export const workOffersPageSchema = z.object({
  items: z.array(workOfferSchema),
  nextCursor: z.string().nullable().optional(),
});

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
