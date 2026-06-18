/** Ejecutor de queries estilo tagged-template (compatible con `neon()`). */
export type SqlExec = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>;

export interface PricePoint {
  ts: number;
  price: number;
}

/** Almacén de histórico de precios (público/global). Async. */
export interface PriceHistoryStore {
  recordSnapshot(prices: Record<string, number>, ts?: number): Promise<void>;
  getHistory(item: string, since: number): Promise<PricePoint[]>;
  listItems(): Promise<string[]>;
}

export class PostgresPriceHistoryStore implements PriceHistoryStore {
  private schemaReady?: Promise<void>;

  constructor(private sql: SqlExec) {}

  private ensureSchema(): Promise<void> {
    return (this.schemaReady ??= this.sql`
      CREATE TABLE IF NOT EXISTS price_snapshots (
        item text NOT NULL,
        price double precision NOT NULL,
        ts bigint NOT NULL
      )
    `.then(() => this.sql`CREATE INDEX IF NOT EXISTS idx_price_item_ts ON price_snapshots (item, ts)`).then(() => {}));
  }

  async recordSnapshot(prices: Record<string, number>, ts: number = Date.now()): Promise<void> {
    await this.ensureSchema();
    const items = Object.keys(prices);
    if (items.length === 0) return;
    const priceArr = items.map((i) => prices[i]);
    const tsArr = items.map(() => ts);
    await this.sql`
      INSERT INTO price_snapshots (item, price, ts)
      SELECT * FROM unnest(${items}::text[], ${priceArr}::float8[], ${tsArr}::bigint[])
    `;
  }

  async getHistory(item: string, since: number): Promise<PricePoint[]> {
    await this.ensureSchema();
    const rows = await this.sql`
      SELECT ts, price FROM price_snapshots WHERE item = ${item} AND ts >= ${since} ORDER BY ts ASC
    `;
    return rows.map((r) => ({ ts: Number(r.ts), price: Number(r.price) }));
  }

  async listItems(): Promise<string[]> {
    await this.ensureSchema();
    const rows = await this.sql`SELECT DISTINCT item FROM price_snapshots`;
    return rows.map((r) => String(r.item));
  }
}
