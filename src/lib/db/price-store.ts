import Database from "better-sqlite3";

export interface PricePoint {
  ts: number;
  price: number;
}

/** Almacén de histórico de precios (público/global). Implementable en SQLite o Postgres. */
export interface PriceHistoryStore {
  /** Registra un snapshot completo de precios con un timestamp (ms). */
  recordSnapshot(prices: Record<string, number>, ts?: number): void;
  /** Serie temporal de un item desde `since` (ms, inclusive), ascendente por ts. */
  getHistory(item: string, since: number): PricePoint[];
  /** Items que tienen algún dato. */
  listItems(): string[];
}

export class SqlitePriceStore implements PriceHistoryStore {
  private db: Database.Database;

  constructor(path = "data/prices.db") {
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS price_snapshots (
        item TEXT NOT NULL,
        price REAL NOT NULL,
        ts INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_item_ts ON price_snapshots (item, ts);`,
    );
  }

  recordSnapshot(prices: Record<string, number>, ts: number = Date.now()): void {
    const insert = this.db.prepare("INSERT INTO price_snapshots (item, price, ts) VALUES (?, ?, ?)");
    const tx = this.db.transaction((entries: [string, number][]) => {
      for (const [item, price] of entries) insert.run(item, price, ts);
    });
    tx(Object.entries(prices));
  }

  getHistory(item: string, since: number): PricePoint[] {
    return this.db
      .prepare("SELECT ts, price FROM price_snapshots WHERE item = ? AND ts >= ? ORDER BY ts ASC")
      .all(item, since) as PricePoint[];
  }

  listItems(): string[] {
    return (this.db.prepare("SELECT DISTINCT item FROM price_snapshots").all() as { item: string }[]).map(
      (r) => r.item,
    );
  }
}
