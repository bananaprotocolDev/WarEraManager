import type { SqlExec } from "./price-store";

export interface Calibration {
  factor: number;
  samples: number;
  updatedAt: number;
}

export interface CalibrationStore {
  get(): Promise<Calibration | null>;
  set(c: Calibration): Promise<void>;
}

export class PostgresCalibrationStore implements CalibrationStore {
  private schemaReady?: Promise<void>;

  constructor(private sql: SqlExec) {}

  private ensureSchema(): Promise<void> {
    return (this.schemaReady ??= this.sql`
      CREATE TABLE IF NOT EXISTS calibration (
        id int PRIMARY KEY,
        factor double precision NOT NULL,
        samples int NOT NULL,
        updated_at bigint NOT NULL
      )
    `.then(() => {}));
  }

  async get(): Promise<Calibration | null> {
    await this.ensureSchema();
    const rows = await this.sql`SELECT factor, samples, updated_at FROM calibration WHERE id = 1`;
    if (rows.length === 0) return null;
    const r = rows[0];
    return { factor: Number(r.factor), samples: Number(r.samples), updatedAt: Number(r.updated_at) };
  }

  async set(c: Calibration): Promise<void> {
    await this.ensureSchema();
    await this.sql`
      INSERT INTO calibration (id, factor, samples, updated_at)
      VALUES (1, ${c.factor}, ${c.samples}, ${c.updatedAt})
      ON CONFLICT (id) DO UPDATE SET factor = excluded.factor, samples = excluded.samples, updated_at = excluded.updated_at
    `;
  }
}
